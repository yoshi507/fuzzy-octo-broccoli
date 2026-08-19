const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData,
    destroy
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop the music and leave the voice channel"),

    async execute(interaction) {

        const data =
            getMusicData(interaction.guild.id);

        if (!data) {
            return interaction.reply({
                content:
                    "❌ I'm not currently in a voice channel.",
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

            destroy(
                interaction.guild.id
            );

            await interaction.reply(
                "⏹️ Music stopped and I left the voice channel."
            );

        } catch (error) {

            console.error(
                "Stop command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't stop the music.",
                ephemeral: true
            });
        }
    }
};
