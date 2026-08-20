const { getPersona } = require("../utils/persona/store.js");

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        for (const guild of client.guilds.cache.values()) {
            try {
                const p = getPersona(guild.id);
                if (p.nickname && guild.members.me) {
                    await guild.members.me.setNickname(p.nickname.slice(0, 32)).catch(() => {});
                }
            } catch {
                /* ignore */
            }
        }
    }
};
