/**
 * Attach the live Discord client to the API after login.
 * The HTTP server itself should already be listening on PORT from index.js startup
 * (required for Wispbyte / process keep-alive).
 */
module.exports = {
    name: "clientReady",
    once: true,

    execute(readyClient) {
        try {
            const { startApiServer, setDiscordClient } = require("../api/server.js");
            setDiscordClient(readyClient);
            startApiServer(readyClient);
            console.log("✅ Dashboard API linked to Discord client");
        } catch (error) {
            console.error(
                "Failed to link API server:",
                error?.message || error
            );
        }
    }
};
