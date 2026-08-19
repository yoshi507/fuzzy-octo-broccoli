const {
    EmbedBuilder
} = require("discord.js");

const {
    loadDatabase
} = require("../database/database.js");

async function logEvent(guild, title, description) {

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

        const embed =
            new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

        await channel.send({
            embeds: [embed]
        });

    } catch (error) {

        console.error(
            "Logging error:",
            error
        );
    }
}

module.exports = {
    logEvent
};
