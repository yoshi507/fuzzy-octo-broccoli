const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription("Shuffle the music queue"),

    async execute(interaction) {

        const data =
            getMusicData(
                interaction.guild.id
            );

        if (!data || !data.current) {
            return interaction.reply({
                content:
                    "❌ Nothing is currently playing.",
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

        if (data.queue.length < 2) {
            return interaction.reply({
                content:
                    "❌ You need at least 2 songs in the queue to shuffle.",
                ephemeral: true
            });
        }

        // Fisher-Yates shuffle
        for (
            let i = data.queue.length - 1;
            i > 0;
            i--
        ) {

            const j =
                Math.floor(
                    Math.random() * (i + 1)
                );

            [
                data.queue[i],
                data.queue[j]
            ] = [
                data.queue[j],
                data.queue[i]
            ];
        }

        await interaction.reply(
            `🔀 Shuffled **${data.queue.length}** songs in the queue.`
        );
    }
};
