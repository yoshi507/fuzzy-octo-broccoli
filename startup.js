/**
 * Final boot: bind PORT early (Wispbyte), then Discord login.
 */
const { Events } = require("discord.js");
const { safeError, activeResourceSummary } = require("./utils/processDiagnostics.js");

function describeToken(raw) {
    if (raw == null || raw === "") {
        return { ok: false, reason: "DISCORD_TOKEN is missing or empty" };
    }
    const trimmed = String(raw).trim().replace(/^["']|["']$/g, "");
    if (!trimmed) {
        return { ok: false, reason: "DISCORD_TOKEN is empty after trimming" };
    }
    if (trimmed.length < 50) {
        return {
            ok: false,
            reason: `DISCORD_TOKEN looks too short (length ${trimmed.length}). Check the host panel value.`
        };
    }
    if (/\s/.test(trimmed)) {
        return {
            ok: false,
            reason: "DISCORD_TOKEN contains whitespace; remove spaces/newlines from the env value"
        };
    }
    return { ok: true, token: trimmed, length: trimmed.length };
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

    client.once(Events.ClientReady, () => {
        console.log("[DIAG] Discord ClientReady fired");
    });
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

    const tokenInfo = describeToken(process.env.DISCORD_TOKEN);
    if (!tokenInfo.ok) {
        console.error(`❌ Discord auth: ${tokenInfo.reason}`);
        if (!process.env.PORT) {
            process.exit(1);
        }
        console.warn("[DIAG] API listening without Discord login");
        return;
    }

    console.log(`🔐 Logging into Discord… (token present, length=${tokenInfo.length})`);

    const heartbeat = setInterval(() => {
        const ready = Boolean(client.readyAt);
        const guilds = client.guilds?.cache?.size ?? 0;
        const listening =
            global.__omnibotHttpServer && global.__omnibotHttpServer.listening;
        console.log(
            `[OmniBot] heartbeat: discord=${ready ? "ready" : "not-ready"} guilds=${guilds} apiListening=${Boolean(listening)}`
        );
    }, 30 * 1000);
    global.__omnibotHeartbeat = heartbeat;

    setTimeout(() => {
        console.log(
            `[DIAG] post-login tick: readyAt=${Boolean(client.readyAt)} wsStatus=${client.ws?.status} resources=${JSON.stringify(activeResourceSummary())}`
        );
    }, 2000);

    const loginPromise = client.login(tokenInfo.token);
    loginPromise.then(
        () => {
            console.log("✅ Discord gateway login accepted (waiting for ready)…");
        },
        (error) => {
            console.error(
                "❌ Discord login failed:",
                JSON.stringify(safeError(error), null, 2)
            );
            const msg = (error && error.message) || "";
            if (/token/i.test(msg) || error?.code === "TokenInvalid") {
                console.error(
                    "[DIAG] Hint: token rejected by Discord. Regenerate bot token and update host env."
                );
            }
            console.warn("[DIAG] API + heartbeat remain active after login failure");
        }
    );
};
