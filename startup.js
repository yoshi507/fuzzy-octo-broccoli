/**
 * OmniBot process entry — Discord client + dashboard API.
 * Resource-aware: no noisy idle heartbeat once Discord is ready.
 */

const path = require("path");
const {
    attachProcessDiagnostics,
    safeError,
    activeResourceSummary
} = require("./utils/processDiagnostics.js");

attachProcessDiagnostics();

// Preload heavy modules after diagnostics so failures are visible
require("./utils/preloadDiag.js");

const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const fs = require("fs");

function resolveBotToken() {
    const candidates = [
        ["DISCORD_TOKEN", process.env.DISCORD_TOKEN],
        ["TOKEN", process.env.TOKEN],
        ["BOT_TOKEN", process.env.BOT_TOKEN]
    ];
    for (const [envName, raw] of candidates) {
        if (raw == null || raw === "") continue;
        const token = String(raw).trim().replace(/^["']|["']$/g, "");
        if (!token) continue;
        return { ok: true, token, envName, length: token.length };
    }
    return {
        ok: false,
        reason:
            "No Discord bot token found. Set DISCORD_TOKEN (preferred) in the host environment."
    };
}

function isDiscordReady(client) {
    try {
        if (typeof client?.isReady === "function") return client.isReady();
        return Boolean(client?.readyAt || client?.user);
    } catch {
        return false;
    }
}

function wsStatusLabel(client) {
    try {
        const s = client?.ws?.status;
        return s == null ? "unknown" : String(s);
    } catch {
        return "unknown";
    }
}

async function start() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates
        ],
        partials: [
            Partials.Channel,
            Partials.Message,
            Partials.Reaction,
            Partials.GuildMember
        ]
    });

    client.commands = new Collection();

    // Load commands
    const commandsPath = path.join(__dirname, "commands");
    let commandCount = 0;
    if (fs.existsSync(commandsPath)) {
        for (const file of fs.readdirSync(commandsPath)) {
            if (!file.endsWith(".js")) continue;
            try {
                const command = require(path.join(commandsPath, file));
                if (command?.data?.name) {
                    client.commands.set(command.data.name, command);
                    commandCount++;
                }
            } catch (err) {
                console.error(`[Commands] Failed to load ${file}:`, err?.message || err);
            }
        }
    }
    console.log(`✅ Loaded ${commandCount} command(s)`);

    // Load events
    const eventsPath = path.join(__dirname, "events");
    let eventCount = 0;
    if (fs.existsSync(eventsPath)) {
        for (const file of fs.readdirSync(eventsPath)) {
            if (!file.endsWith(".js")) continue;
            try {
                const event = require(path.join(eventsPath, file));
                if (!event?.name || typeof event.execute !== "function") continue;
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args));
                } else {
                    client.on(event.name, (...args) => event.execute(...args));
                }
                eventCount++;
            } catch (err) {
                console.error(`[Events] Failed to load ${file}:`, err?.message || err);
            }
        }
    }
    console.log(`✅ Loaded ${eventCount} event file(s)`);

    // Start API (keeps process alive for Wispbyte PORT)
    try {
        const { startApiServer } = require("./api/server.js");
        await startApiServer(client);
    } catch (error) {
        console.error(
            "[DIAG] Failed to start API server at boot:",
            JSON.stringify(safeError(error), null, 2)
        );
    }

    const tokenInfo = resolveBotToken();
    if (!tokenInfo.ok) {
        console.error(`❌ Discord auth: ${tokenInfo.reason}`);
        if (!process.env.PORT) {
            process.exit(1);
        }
        console.warn(
            "[DIAG] API listening without Discord login — bot will stay offline until a valid DISCORD_TOKEN is set and the process is restarted."
        );
        if (process.env.OMNIBOT_DEBUG === "1" || process.env.DEBUG_HEARTBEAT === "1") {
            global.__omnibotHeartbeat = setInterval(() => {
                console.log(
                    `[OmniBot] heartbeat: discord=not-ready guilds=0 apiListening=${Boolean(
                        global.__omnibotHttpServer && global.__omnibotHttpServer.listening
                    )} (no token)`
                );
            }, 60 * 1000);
            if (typeof global.__omnibotHeartbeat.unref === "function") {
                global.__omnibotHeartbeat.unref();
            }
        }
        return;
    }

    console.log(
        `🔐 Logging into Discord… (env=${tokenInfo.envName}, token length=${tokenInfo.length}, segments=${tokenInfo.token.split(".").length})`
    );

    let loginSettled = false;
    let loginFailed = false;

    const debugHb =
        process.env.OMNIBOT_DEBUG === "1" || process.env.DEBUG_HEARTBEAT === "1";
    const heartbeat = setInterval(() => {
        const ready = isDiscordReady(client);
        if (!debugHb && ready) {
            clearInterval(heartbeat);
            if (global.__omnibotHeartbeat === heartbeat) global.__omnibotHeartbeat = null;
            return;
        }
        const guilds = client.guilds?.cache?.size ?? 0;
        const listening =
            global.__omnibotHttpServer && global.__omnibotHttpServer.listening;
        console.log(
            `[OmniBot] heartbeat: discord=${ready ? "ready" : "not-ready"} guilds=${guilds} apiListening=${Boolean(
                listening
            )} ws=${wsStatusLabel(client)} loginSettled=${loginSettled} loginFailed=${loginFailed}`
        );
        if (!ready && loginSettled && !loginFailed) {
            console.warn(
                "[DIAG] Login promise resolved but client is still not ready — gateway may be stuck. Check outbound network to Discord."
            );
        }
    }, debugHb ? 60 * 1000 : 30 * 1000);
    if (typeof heartbeat.unref === "function") heartbeat.unref();
    global.__omnibotHeartbeat = heartbeat;

    const pendingTimer = setTimeout(() => {
        if (!loginSettled && !isDiscordReady(client)) {
            console.error(
                "[DIAG] Discord client.login() has not settled after 20s. Common causes: invalid token, blocked outbound WebSocket to Discord, or host DNS/network issues."
            );
        }
    }, 20_000);
    if (typeof pendingTimer.unref === "function") pendingTimer.unref();

    try {
        await client.login(tokenInfo.token);
        loginSettled = true;
        console.log("✅ Discord login promise resolved");
    } catch (err) {
        loginSettled = true;
        loginFailed = true;
        console.error(
            "❌ Discord login failed:",
            JSON.stringify(safeError(err), null, 2)
        );
        console.warn(
            "[DIAG] API + heartbeat remain active after login failure — Discord bot is offline."
        );
    } finally {
        clearTimeout(pendingTimer);
    }
}

start().catch((err) => {
    console.error("[FATAL] startup failed:", JSON.stringify(safeError(err), null, 2));
    console.error("[DIAG] resources:", JSON.stringify(activeResourceSummary()));
});
