const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show the music queue"),

    async execute(interaction) {

        const data =
            getMusicData(interaction.guild.id);

        if (!data) {
            return interaction.reply({
                content:
                    "❌ Nothing is playing and the queue is empty.",
                ephemeral: true
            });
        }

        const current =
            data.current
                ? `🎵 **${data.current.title}**`
                : "Nothing";

        if (!data.queue.length) {

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("📋 Music Queue")
                        .setDescription(
                            `**Now Playing:**\n${current}\n\n` +
                            "📭 The queue is empty."
                        )
                ]
            });
        }

        const queueList =
            data.queue
                .map(
                    (song, index) =>
                        `**${index + 1}.** ${song.title}`
                )
                .join("\n");

        const embed =
            new EmbedBuilder()
                .setTitle("📋 Music Queue")
                .setDescription(
                    `**Now Playing:**\n${current}\n\n` +
                    `**Up Next:**\n${queueList}`
                )
                .setFooter({
                    text:
                        `${data.queue.length} song(s) waiting`
                });

        await interaction.reply({
            embeds: [embed]
        });
    }
};
