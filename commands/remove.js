const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a song from the queue")
        .addIntegerOption(option =>
            option
                .setName("position")
                .setDescription("Queue position to remove")
                .setMinValue(1)
                .setRequired(true)
        ),

    async execute(interaction) {

        const data =
            getMusicData(
                interaction.guild.id
            );

        if (!data || !data.current) {
            return interaction.reply({
                content:
                    "❌ There is no music queue.",
                ephemeral: true
            });
        }

        if (!interaction.member.voice.channel) {
            return interaction.reply({
                content:
                    "❌ You need to be in a voice channel.",
                ephemeral: true
            });
        }

        const position =
            interaction.options.getInteger(
                "position"
            );

        if (
            position > data.queue.length
        ) {
            return interaction.reply({
                content:
                    `❌ There isn't a song at queue position **${position}**.`,
                ephemeral: true
            });
        }

        const removed =
            data.queue.splice(
                position - 1,
                1
            )[0];

        await interaction.reply(
            `🗑️ Removed **${removed.title}** from the queue.`
        );
    }
};
