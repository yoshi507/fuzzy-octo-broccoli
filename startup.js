/**
 * Final boot: bind PORT early (Wispbyte), then Discord login.
 */
module.exports = function boot(client) {
    try {
        const { startApiServer } = require("./api/server.js");
        startApiServer(client);
    } catch (error) {
        console.error("Failed to start API server at boot:", error?.message || error);
    }

    console.log("🔐 Logging into Discord…");
    client
        .login(process.env.DISCORD_TOKEN)
        .catch((error) => {
            console.error(
                "❌ Discord login failed:",
                error?.message || error?.code || error
            );
            if (!process.env.PORT) {
                process.exit(1);
            }
        });
};
