const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData,
    playSong
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("seek")
        .setDescription("Jump to a position in the current song")
        .addIntegerOption(option =>
            option
                .setName("seconds")
                .setDescription("Position in seconds")
                .setMinValue(0)
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

        const seconds =
            interaction.options.getInteger(
                "seconds"
            );

        const current =
            data.current;

        try {

            if (data.ffmpeg) {

                try {
                    data.ffmpeg.kill();
                } catch {}
            }

            await playSong(
                data,
                current.title,
                current.url,
                seconds
            );

            await interaction.reply(
                `⏩ Jumped **${current.title}** to **${seconds} seconds**.`
            );

        } catch (error) {

            console.error(
                "Seek command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't seek in the song.",
                ephemeral: true
            });
        }
    }
};
