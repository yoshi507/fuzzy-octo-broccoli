const {
    logEvent
} = require("../utils/logger.js");

module.exports = {
    name: "guildMemberRemove",

    async execute(member) {

        await logEvent(
            member.guild,
            "🚪 Member Left",
            `**${member.user.tag}** left the server.`
        );
    }
};
