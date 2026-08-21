const { initGiveawayScheduler } = require("../utils/giveaways/scheduler.js");

module.exports = {
    name: "clientReady",
    once: true,
    execute(client) {
        initGiveawayScheduler(client);
    }
};
