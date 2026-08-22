/**
 * Final boot: bind PORT early (Wispbyte), then Discord login.
 */
const { Events, Status } = require("discord.js");
const { safeError, activeResourceSummary } = require("./utils/processDiagnostics.js");

function describeToken(raw) {
    if (raw == null || raw === "") {
        return { ok: false, reason: "value is missing or empty" };
    }
    const trimmed = String(raw).trim().replace(/^["']|["']$/g, "");
    if (!trimmed) {
        return { ok: false, reason: "value is empty after trimming quotes/whitespace" };
    }
    if (trimmed.length < 50) {
        return {
            ok: false,
            reason: `value looks too short (length ${trimmed.length})`
        };
    }
    if (/\s/.test(trimmed)) {
        return {
            ok: false,
            reason: "value contains whitespace; remove spaces/newlines"
        };
    }
    if (trimmed.split(".").length < 3) {
        return {
            ok: false,
            reason: "value does not look like a Discord bot token (expected three dot-separated segments)"
        };
    }
    return { ok: true, token: trimmed, length: trimmed.length };
}

function resolveBotToken() {
    const candidates = [
        ["DISCORD_TOKEN", process.env.DISCORD_TOKEN],
        ["TOKEN", process.env.TOKEN],
        ["BOT_TOKEN", process.env.BOT_TOKEN]
    ];
    const failures = [];
    for (const [name, raw] of candidates) {
        if (raw == null || String(raw).trim() === "") {
            failures.push(`${name}=unset`);
            continue;
        }
        const info = describeToken(raw);
        if (info.ok) {
            return { ok: true, token: info.token, envName: name, length: info.length };
        }
        failures.push(`${name}=${info.reason}`);
    }
    return {
        ok: false,
        reason: `No usable Discord bot token (${failures.join("; ")})`
    };
}

function wsStatusLabel(client) {
    try {
        const s = client?.ws?.status;
        if (s == null) return "unknown";
        const names = Status || {};
        for (const [k, v] of Object.entries(names)) {
            if (v === s) return k;
        }
        return String(s);
    } catch {
        return "unknown";
    }
}

function isDiscordReady(client) {
    try {
        if (typeof client.isReady === "function" && client.isReady()) return true;
        return Boolean(client?.readyAt || client?.user);
    } catch {
        return false;
    }
}

function attachClientDiagnostics(client) {
    const log = (label, err) => {
        console.error(`[Discord] ${label}:`, JSON.stringify(safeError(err), null, 2));
    };
    client.on("error", (e) => log("error", e));
    client.on("warn", (m) => console.warn("[Discord] warn:", m));
    client.on("shardError", (e, id) => log(`shardError#${id}`, e));
    client.on("invalidated", () => console.error("[Discord] session invalidated"));
    client.on("shardDisconnect", (ev, id) =>
        console.warn(`[Discord] shardDisconnect#${id}`, ev?.code || ev)
    );
    client.on("shardReconnecting", (id) =>
        console.warn(`[Discord] shardReconnecting#${id}`)
    );

    let readyLogged = false;
    const onReady = () => {
        if (readyLogged) return;
        readyLogged = true;
        console.log(
            `✅ OmniBot online as ${client.user?.tag || client.user?.id} · guilds=${client.guilds?.cache?.size ?? 0}`
        );
        try {
            const { registerSlashCommands } = require("./utils/registerSlashCommands.js");
            registerSlashCommands(client).catch((e) =>
                console.error("[SlashRegister]", e?.message || e)
            );
        } catch (e) {
            console.error("[SlashRegister] load failed:", e?.message || e);
        }
        try {
            const { startDeadChatRunner } = require("./utils/ai/deadChatRunner.js");
            startDeadChatRunner(client);
        } catch (e) {
            console.error("[DeadChat] start failed:", e?.message || e);
        }
    };
    // discord.js v14+: use clientReady ("ready" is deprecated and will be removed in v15)
    client.once("clientReady", onReady);
}

module.exports = function boot(client) {
    attachClientDiagnostics(client);

    // API should already be started by bootstrap; ensure reference exists
    const tokenInfo = resolveBotToken();
    if (!tokenInfo.ok) {
        console.error(`❌ Discord auth: ${tokenInfo.reason}`);
        if (!process.env.PORT) {
            process.exit(1);
        }
        console.warn(
            "[DIAG] API listening without Discord login — bot will stay offline until a valid DISCORD_TOKEN is set and the process is restarted."
        );
        // Debug-only heartbeat when token missing (avoid log spam / CPU wakeups)
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

    // Lightweight readiness probe only until Discord is ready, or when OMNIBOT_DEBUG=1.
    // Discord.js maintains its own gateway heartbeat — we must not add another noisy loop.
    const debugHb = process.env.OMNIBOT_DEBUG === "1" || process.env.DEBUG_HEARTBEAT === "1";
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
                "[DIAG] Discord client.login() has not settled after 20s. Common causes: invalid token (hangs rare), blocked outbound WebSocket to Discord, or host DNS/network issues."
            );
        }
    }, 20_000);
    if (typeof pendingTimer.unref === "function") pendingTimer.unref();

    const readyWatch = setTimeout(() => {
        if (!isDiscordReady(client) && loginSettled && !loginFailed) {
            console.warn(
                "[DIAG] Still not ready 45s after login accepted — check network to Discord gateway."
            );
        }
    }, 45_000);
    if (typeof readyWatch.unref === "function") readyWatch.unref();

    let loginPromise;
    try {
        loginPromise = client.login(tokenInfo.token);
    } catch (error) {
        loginSettled = true;
        loginFailed = true;
        clearTimeout(pendingTimer);
        console.error(
            "❌ Discord login threw synchronously:",
            JSON.stringify(safeError(error), null, 2)
        );
        return;
    }

    if (!loginPromise || typeof loginPromise.then !== "function") {
        loginSettled = true;
        loginFailed = true;
        clearTimeout(pendingTimer);
        console.error("❌ client.login() did not return a Promise — Discord client may be invalid.");
        return;
    }

    loginPromise.then(
        () => {
            loginSettled = true;
            clearTimeout(pendingTimer);
            console.log("✅ Discord gateway login accepted (waiting for ready event)…");
            console.log(
                `[DIAG] post-login: ws=${wsStatusLabel(client)} ready=${isDiscordReady(client)} guilds=${client.guilds?.cache?.size ?? 0}`
            );
        },
        (error) => {
            loginSettled = true;
            loginFailed = true;
            clearTimeout(pendingTimer);
            clearTimeout(readyWatch);
            console.error(
                "❌ Discord login failed:",
                JSON.stringify(safeError(error), null, 2)
            );
            const msg = (error && error.message) || "";
            if (/token/i.test(msg) || error?.code === "TokenInvalid" || error?.code === 4004) {
                console.error(
                    "[DIAG] Hint: Discord rejected the token. In the Discord Developer Portal → Bot → Reset Token, then set DISCORD_TOKEN on Wispbyte to the *bot* token (not the OAuth client secret)."
                );
            }
            console.warn("[DIAG] API + heartbeat remain active after login failure — Discord bot is offline.");
        }
    );
};
