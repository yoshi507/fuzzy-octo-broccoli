const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the current song"),

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

            const skipped =
                data.current.title;

            data.player.stop();

            data.current = null;

            await interaction.reply(
                `⏭️ Skipped **${skipped}**.`
            );

        } catch (error) {

            console.error(
                "Skip command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't skip the song.",
                ephemeral: true
            });
        }
    }
};
