const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription("Lock the current channel")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageChannels
        ),

    async execute(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            await sendModLog(interaction.guild, {
                title: "🔒 Channel Locked",
                description:
                    `${interaction.user} locked ${interaction.channel}.`,
                userId: interaction.user.id,
                moderatorId: interaction.user.id,
                reason: "Channel locked"
            });

            await interaction.reply(
                `🔒 ${interaction.channel} has been locked.`
            );

        } catch (error) {
            console.error("Lock error:", error);

            await interaction.reply({
                content:
                    "❌ I couldn't lock this channel.",
                ephemeral: true
            });
        }
    }
};
