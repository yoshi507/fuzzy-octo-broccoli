const { registerSlashCommands } = require("../utils/registerSlashCommands.js");

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        try {
            await registerSlashCommands(client);
        } catch (err) {
            console.error(
                "[SlashRegister] Unexpected error:",
                err?.message || err
            );
        }
    }
};
