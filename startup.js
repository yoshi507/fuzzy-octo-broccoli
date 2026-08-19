/**
 * Final boot: bind PORT early (Wispbyte), then Discord login.
 * Keeps the process alive via the HTTP server and an explicit heartbeat.
 */
const { Events } = require("discord.js");

function describeToken(raw) {
    if (raw == null || raw === "") {
        return { ok: false, reason: "DISCORD_TOKEN is missing or empty" };
    }
    const trimmed = String(raw).trim().replace(/^["']|["']$/g, "");
    if (!trimmed) {
        return { ok: false, reason: "DISCORD_TOKEN is empty after trimming" };
    }
    // Discord bot tokens are long; never log the value
    if (trimmed.length < 50) {
        return {
            ok: false,
            reason: `DISCORD_TOKEN looks too short (length ${trimmed.length}). Check the value in the host panel.`
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
        console.error(
            "[Discord] client error:",
            error?.message || error?.code || error
        );
    });

    client.on("warn", (message) => {
        console.warn("[Discord] warn:", message);
    });

    client.on("shardError", (error, shardId) => {
        console.error(
            `[Discord] shardError (shard ${shardId}):`,
            error?.message || error
        );
    });

    client.on("shardDisconnect", (event, shardId) => {
        console.warn(
            `[Discord] shardDisconnect (shard ${shardId}): code=${event?.code} reason=${event?.reason || "n/a"}`
        );
    });

    client.on("shardReconnecting", (shardId) => {
        console.log(`[Discord] shardReconnecting (shard ${shardId})…`);
    });

    client.on("invalidated", () => {
        console.error(
            "[Discord] Session invalidated. The token may be reset or invalid. Process will stay up for the API; fix DISCORD_TOKEN and restart."
        );
    });
}

module.exports = function boot(client) {
    // Keep a hard reference so the HTTP server is never GC'd
    let httpServer = null;

    try {
        const { startApiServer } = require("./api/server.js");
        httpServer = startApiServer(client);
        if (httpServer) {
            global.__omnibotHttpServer = httpServer;
        }
    } catch (error) {
        console.error(
            "Failed to start API server at boot:",
            error?.message || error
        );
    }

    attachClientDiagnostics(client);

    const tokenInfo = describeToken(process.env.DISCORD_TOKEN);
    if (!tokenInfo.ok) {
        console.error(`❌ Discord auth: ${tokenInfo.reason}`);
        console.error(
            "Set DISCORD_TOKEN in the host environment (Wispbyte secrets/env). Do not put the token in source code."
        );
        if (!process.env.PORT) {
            process.exit(1);
        }
        console.warn(
            "API is listening without Discord. Fix DISCORD_TOKEN and restart."
        );
        return;
    }

    console.log(
        `🔐 Logging into Discord… (token present, length=${tokenInfo.length})`
    );

    const heartbeat = setInterval(() => {
        const ready = Boolean(client.readyAt);
        const guilds = client.guilds?.cache?.size ?? 0;
        console.log(
            `[OmniBot] heartbeat: discord=${ready ? "ready" : "not-ready"} guilds=${guilds} api=${httpServer || global.__omnibotHttpServer ? "up" : "down"}`
        );
    }, 5 * 60 * 1000);
    global.__omnibotHeartbeat = heartbeat;

    client
        .login(tokenInfo.token)
        .then(() => {
            console.log("✅ Discord gateway login accepted (waiting for ready event)…");
        })
        .catch((error) => {
            const code = error?.code || error?.rawError?.code;
            const msg = error?.message || String(error);
            console.error("❌ Discord login failed.");
            console.error(`   message: ${msg}`);
            if (code != null) console.error(`   code: ${code}`);

            const lower = msg.toLowerCase();
            if (
                lower.includes("token") ||
                lower.includes("unauthorized") ||
                code === "TokenInvalid" ||
                code === 401
            ) {
                console.error(
                    "   Hint: DISCORD_TOKEN is invalid or revoked. Regenerate the bot token in the Discord Developer Portal and update the host env var."
                );
            } else if (lower.includes("intent")) {
                console.error(
                    "   Hint: Enable required Privileged Gateway Intents (Server Members, Message Content, Presence if used) in the Discord Developer Portal."
                );
            }

            console.warn(
                "API remains listening. Fix Discord auth and restart the process."
            );
        });
};
