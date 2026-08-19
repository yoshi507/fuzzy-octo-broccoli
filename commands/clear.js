const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Delete messages from this channel")
        .addIntegerOption(option =>
            option
                .setName("amount")
                .setDescription("Number of messages to delete")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    async execute(interaction) {
        const amount =
            interaction.options.getInteger("amount");

        if (!interaction.channel.isTextBased()) {
            return interaction.reply({
                content:
                    "❌ This command can only be used in a text channel.",
                ephemeral: true
            });
        }

        try {
            const deleted =
                await interaction.channel.bulkDelete(
                    amount,
                    true
                );

            await sendModLog(interaction.guild, {
                title: "🧹 Messages Cleared",
                description:
                    `${interaction.user} cleared **${deleted.size} message(s)** in ${interaction.channel}.`,
                userId: interaction.user.id,
                moderatorId: interaction.user.id,
                reason:
                    `Cleared ${deleted.size} message(s)`
            });

            await interaction.reply({
                content:
                    `🧹 Deleted **${deleted.size} message(s)**.`,
                ephemeral: true
            });

        } catch (error) {
            console.error(
                "Clear command error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't delete those messages. Make sure I have **Manage Messages** permission.",
                ephemeral: true
            });
        }
    }
};
