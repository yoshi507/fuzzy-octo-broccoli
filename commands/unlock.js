const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Unlock the current channel")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageChannels
        ),

    async execute(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    SendMessages: null
                }
            );

            await sendModLog(interaction.guild, {
                title: "🔓 Channel Unlocked",
                description:
                    `${interaction.user} unlocked ${interaction.channel}.`,
                userId: interaction.user.id,
                moderatorId: interaction.user.id,
                reason: "Channel unlocked"
            });

            await interaction.reply(
                `🔓 ${interaction.channel} has been unlocked.`
            );

        } catch (error) {
            console.error("Unlock error:", error);

            await interaction.reply({
                content:
                    "❌ I couldn't unlock this channel.",
                ephemeral: true
            });
        }
    }
};
