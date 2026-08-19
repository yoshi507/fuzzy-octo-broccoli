const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("slowmode")
        .setDescription("Set the slowmode for this channel")
        .addIntegerOption(option =>
            option
                .setName("seconds")
                .setDescription("Slowmode duration in seconds (0-21600)")
                .setMinValue(0)
                .setMaxValue(21600)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageChannels
        ),

    async execute(interaction) {
        const seconds =
            interaction.options.getInteger("seconds");

        try {
            await interaction.channel.setRateLimitPerUser(
                seconds
            );

            const status =
                seconds === 0
                    ? "disabled"
                    : `set to **${seconds} second(s)**`;

            await sendModLog(interaction.guild, {
                title: "🐌 Slowmode Changed",
                description:
                    `${interaction.user} ${status} in ${interaction.channel}.`,
                userId: interaction.user.id,
                moderatorId: interaction.user.id,
                reason:
                    seconds === 0
                        ? "Slowmode disabled"
                        : `Slowmode set to ${seconds} seconds`
            });

            await interaction.reply({
                content:
                    seconds === 0
                        ? "🐌 Slowmode has been disabled."
                        : `🐌 Slowmode is now **${seconds} second(s)**.`,
                ephemeral: true
            });

        } catch (error) {
            console.error(
                "Slowmode error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't change the slowmode for this channel.",
                ephemeral: true
            });
        }
    }
};
