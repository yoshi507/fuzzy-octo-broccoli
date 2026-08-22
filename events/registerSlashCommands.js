const { registerSlashCommands } = require("../utils/registerSlashCommands.js");

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        try {
            console.log(
                `✅ OmniBot online as ${client.user?.tag || client.user?.id} · guilds=${client.guilds?.cache?.size ?? 0}`
            );
            await registerSlashCommands(client);
        } catch (err) {
            console.error(
                "[SlashRegister] Unexpected error:",
                err?.message || err
            );
        }
    }
};
