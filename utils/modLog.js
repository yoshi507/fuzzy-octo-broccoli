const {
    EmbedBuilder
} = require("discord.js");

const {
    loadDatabase
} = require("../database/database.js");

async function sendModLog(guild, {
    title,
    description,
    userId,
    moderatorId,
    reason
}) {
    try {
        const database = loadDatabase();

        const settings =
            database.logging?.[guild.id];

        if (!settings?.enabled) return;

        const channel =
            guild.channels.cache.get(
                settings.channelId
            );

        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .addFields(
                {
                    name: "👤 User",
                    value: `<@${userId}>`,
                    inline: true
                },
                {
                    name: "🛡️ Moderator",
                    value: `<@${moderatorId}>`,
                    inline: true
                },
                {
                    name: "📝 Reason",
                    value: reason || "No reason provided.",
                    inline: false
                }
            )
            .setTimestamp();

        await channel.send({
            embeds: [embed]
        });

    } catch (error) {
        console.error(
            "Moderation logging error:",
            error
        );
    }
}

module.exports = {
    sendModLog
};
