const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clearqueue")
        .setDescription("Clear all songs waiting in the queue"),

    async execute(interaction) {

        const data =
            getMusicData(
                interaction.guild.id
            );

        if (!data || !data.current) {
            return interaction.reply({
                content:
                    "❌ The queue is already empty.",
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

        const amount =
            data.queue.length;

        if (amount === 0) {
            return interaction.reply(
                "📭 The queue is already empty."
            );
        }

        data.queue.length = 0;

        await interaction.reply(
            `🗑️ Cleared **${amount}** song(s) from the queue.`
        );
    }
};
