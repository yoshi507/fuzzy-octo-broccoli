const { listAllActive } = require("../utils/giveaways/store.js");
const { finishGiveaway } = require("../commands/giveaway.js");

module.exports = {
    name: "clientReady",
    once: true,
    execute(client) {
        const tick = async () => {
            try {
                const all = listAllActive();
                const now = Date.now();
                for (const g of all) {
                    if (g.status === "active" && g.endsAt && g.endsAt <= now) {
                        await finishGiveaway(client, g.guildId, g.id);
                    }
                }
            } catch (e) {
                console.error("Giveaway recovery tick:", e?.message || e);
            }
        };
        tick();
        setInterval(tick, 30 * 1000);
        console.log("[Giveaways] recovery timer started");
    }
};
