const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Resume the current song"),

    async execute(interaction) {

        const data =
            getMusicData(interaction.guild.id);

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

        try {

            data.player.unpause();

            await interaction.reply(
                `▶️ Resumed **${data.current.title}**.`
            );

        } catch (error) {

            console.error(
                "Resume command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't resume the song.",
                ephemeral: true
            });
        }
    }
};
