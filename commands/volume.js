const {
    SlashCommandBuilder
} = require("discord.js");

const {
    getMusicData
} = require("../utils/music/player.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("volume")
        .setDescription("Change the music volume")
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription("Volume from 0 to 100")
                .setMinValue(0)
                .setMaxValue(100)
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

        const amount =
            interaction.options.getInteger(
                "amount"
            );

        try {

            data.volume =
                amount / 100;

            const resource =
                data.player.state.resource;

            if (
                resource &&
                resource.volume
            ) {
                resource.volume.setVolume(
                    data.volume
                );
            }

            await interaction.reply(
                `🔊 Volume set to **${amount}%**.`
            );

        } catch (error) {

            console.error(
                "Volume command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't change the volume.",
                ephemeral: true
            });
        }
    }
};
