const {
    loadDatabase
} = require("../database/database.js");

module.exports = {
    name: "guildMemberRemove",

    async execute(member) {
        const database = loadDatabase();

        const settings =
            database.goodbyeSettings?.[member.guild.id];

        if (!settings?.enabled) return;

        const channel = member.guild.channels.cache.get(
            settings.channelId
        );

        if (!channel) return;

        const message = settings.message
            .replaceAll("{user}", `<@${member.id}>`)
            .replaceAll("{username}", member.user.username)
            .replaceAll("{server}", member.guild.name)
            .replaceAll(
                "{membercount}",
                member.guild.memberCount.toString()
            );

        await channel.send(message).catch(() => {});
    }
};
