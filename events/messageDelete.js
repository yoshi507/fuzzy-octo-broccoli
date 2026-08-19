const {
    logEvent
} = require("../utils/logger.js");

module.exports = {
    name: "messageDelete",

    async execute(message) {

        if (!message.guild) return;

        if (message.author?.bot) return;

        const content =
            message.content || "No message content available.";

        await logEvent(
            message.guild,
            "🗑️ Message Deleted",
            `**${message.author?.tag || "Unknown User"}** deleted a message:\n\n${content}`
        );
    }
};
