const { applyPersonaToDiscord } = require("../utils/persona/store.js");

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        let applied = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                const result = await applyPersonaToDiscord(client, guild.id);
                if (result.nicknameApplied && result.nickname) applied++;
            } catch {
                /* ignore */
            }
        }
        if (applied > 0) {
            console.log(`✅ Applied persona nicknames in ${applied} guild(s)`);
        }
    }
};
