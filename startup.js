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
    // Discord bot tokens are typically three base64-ish segments
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
            return { ok: true, token: info.token, length: info.length, envName: name };
        }
        failures.push(`${name}: ${info.reason}`);
    }
    return {
        ok: false,
        reason:
            "No usable Discord bot token found. Set DISCORD_TOKEN (preferred) to the Bot token from the Discord Developer Portal → Bot. Checked: " +
            failures.join("; ")
    };
}

function wsStatusLabel(client) {
    const status = client?.ws?.status;
    if (status === undefined || status === null) return "unknown";
    const names = Status && typeof Status === "object" ? Object.entries(Status) : [];
    for (const [name, val] of names) {
        if (val === status) return `${name}(${status})`;
    }
    return String(status);
}

function isDiscordReady(client) {
    try {
        if (typeof client.isReady === "function" && client.isReady()) return true;
    } catch {
        /* ignore */
    }
    return Boolean(client.readyAt);
}

function attachClientDiagnostics(client) {
    client.on(Events.Error, (error) => {
        console.error("[DIAG] Discord client error:", JSON.stringify(safeError(error), null, 2));
    });

    client.on("warn", (message) => {
        console.warn("[DIAG] Discord warn:", message);
    });

    client.on("shardError", (error, shardId) => {
        console.error(
            `[DIAG] Discord shardError (shard ${shardId}):`,
            JSON.stringify(safeError(error), null, 2)
        );
    });

    client.on("shardDisconnect", (event, shardId) => {
        console.warn(
            `[DIAG] Discord shardDisconnect (shard ${shardId}): code=${event?.code} reason=${event?.reason || "n/a"} wasClean=${event?.wasClean}`
        );
    });

    client.on("shardReconnecting", (shardId) => {
        console.log(`[DIAG] Discord shardReconnecting (shard ${shardId})…`);
    });

    client.on("shardResume", (shardId) => {
        console.log(`[DIAG] Discord shardResume (shard ${shardId})`);
    });

    client.on("invalidated", () => {
        console.error(
            "[DIAG] Discord session invalidated (token reset/invalid). API stays up; fix DISCORD_TOKEN and restart."
        );
    });

    // discord.js v14.14+ emits "clientReady"; older code used "ready"
    const onReady = (readyClient) => {
        const c = readyClient || client;
        console.log("[DIAG] Discord ready event fired");
        console.log("================================");
        console.log("        OMNIBOT ONLINE");
        console.log("================================");
        console.log(`Logged in as: ${c.user?.tag || c.user?.username || "?"}`);
        console.log(`Servers: ${c.guilds?.cache?.size ?? 0}`);
        console.log("================================");
    };
    client.once(Events.ClientReady, onReady);
    // Extra safety if Events.ClientReady mapping differs on the installed version
    client.once("ready", onReady);
    client.once("clientReady", onReady);
}

module.exports = function boot(client) {
    let httpServer = null;

    try {
        const { startApiServer } = require("./api/server.js");
        httpServer = startApiServer(client);
        if (httpServer) {
            global.__omnibotHttpServer = httpServer;
            console.log("[DIAG] HTTP server handle stored; event loop should stay active");
            console.log("[DIAG] resources after listen call:", JSON.stringify(activeResourceSummary()));
        } else {
            console.warn("[DIAG] HTTP server was not started (PORT missing or invalid?)");
            console.warn(
                `[DIAG] PORT raw type=${typeof process.env.PORT} finite=${Number.isFinite(Number(process.env.PORT))}`
            );
        }
    } catch (error) {
        console.error(
            "[DIAG] Failed to start API server at boot:",
            JSON.stringify(safeError(error), null, 2)
        );
    }

    attachClientDiagnostics(client);

    const tokenInfo = resolveBotToken();
    if (!tokenInfo.ok) {
        console.error(`❌ Discord auth: ${tokenInfo.reason}`);
        if (!process.env.PORT) {
            process.exit(1);
        }
        console.warn(
            "[DIAG] API listening without Discord login — bot will stay offline until a valid DISCORD_TOKEN is set and the process is restarted."
        );
        // Heartbeat still useful so ops can see discord=not-ready
        global.__omnibotHeartbeat = setInterval(() => {
            console.log(
                `[OmniBot] heartbeat: discord=not-ready guilds=0 apiListening=${Boolean(
                    global.__omnibotHttpServer && global.__omnibotHttpServer.listening
                )} (no token)`
            );
        }, 30 * 1000);
        return;
    }

    console.log(
        `🔐 Logging into Discord… (env=${tokenInfo.envName}, token length=${tokenInfo.length}, segments=${tokenInfo.token.split(".").length})`
    );

    let loginSettled = false;
    let loginFailed = false;

    const heartbeat = setInterval(() => {
        const ready = isDiscordReady(client);
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
    }, 30 * 1000);
    global.__omnibotHeartbeat = heartbeat;

    // Warn if login neither resolves nor rejects quickly
    const pendingTimer = setTimeout(() => {
        if (!loginSettled && !isDiscordReady(client)) {
            console.error(
                "[DIAG] Discord client.login() has not settled after 20s. Common causes: invalid token (hangs rare), blocked outbound WebSocket to Discord, or host DNS/network issues."
            );
            console.error(
                `[DIAG] ws=${wsStatusLabel(client)} readyAt=${Boolean(client.readyAt)} resources=${JSON.stringify(
                    activeResourceSummary()
                )}`
            );
        }
    }, 20_000);

    const readyWatch = setTimeout(() => {
        if (!isDiscordReady(client)) {
            console.error(
                "[DIAG] Discord still not ready 45s after login attempt. Bot will remain offline until this is fixed."
            );
            console.error(
                `[DIAG] ws=${wsStatusLabel(client)} loginSettled=${loginSettled} loginFailed=${loginFailed}`
            );
        }
    }, 45_000);

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
