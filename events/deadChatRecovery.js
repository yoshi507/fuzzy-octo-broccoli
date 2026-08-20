const { startDeadChatRunner } = require("../utils/ai/deadChatRunner.js");

module.exports = {
    name: "clientReady",
    once: true,
    execute(client) {
        try {
            startDeadChatRunner(client);
        } catch (err) {
            console.error("[DeadChat] failed to start runner:", err?.message || err);
        }
    }
};
