const {
    logEvent
} = require("../utils/logger.js");

module.exports = {
    name: "guildMemberAdd",

    async execute(member) {

        await logEvent(
            member.guild,
            "👋 Member Joined",
            `${member.user} joined the server.`
        );
    }
};
