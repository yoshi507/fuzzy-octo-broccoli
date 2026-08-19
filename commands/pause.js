const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pause the current song"),

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

            data.player.pause();

            await interaction.reply(
                `⏸️ Paused **${data.current.title}**.`
            );

        } catch (error) {

            console.error(
                "Pause command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't pause the song.",
                ephemeral: true
            });
        }
    }
};
