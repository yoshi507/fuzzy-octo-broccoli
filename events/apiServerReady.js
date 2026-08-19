/**
 * Starts the dashboard REST API when OmniBot is online.
 * Uses PORT from the environment (Wispbyte).
 */
module.exports = {
    name: "clientReady",
    once: true,

    execute(readyClient) {
        try {
            const { startApiServer } = require("../api/server.js");
            startApiServer(readyClient);
        } catch (error) {
            console.error(
                "Failed to start API server:",
                error?.message || error
            );
        }
    }
};
