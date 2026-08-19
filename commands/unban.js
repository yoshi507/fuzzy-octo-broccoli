const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user")
        .addStringOption(option =>
            option
                .setName("user_id")
                .setDescription("The Discord ID of the banned user")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Reason for the unban")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.BanMembers
        ),

    async execute(interaction) {
        const userId = interaction.options.getString("user_id");
        const reason = interaction.options.getString("reason");

        if (!/^\d{17,20}$/.test(userId)) {
            return interaction.reply({
                content: "❌ That doesn't look like a valid Discord user ID.",
                ephemeral: true
            });
        }

        try {
            const ban = await interaction.guild.bans.fetch(userId);

            await interaction.guild.members.unban(
                userId,
                reason
            );

            await sendModLog(interaction.guild, {
                title: "🔓 Member Unbanned",
                description: `${ban.user} has been unbanned.`,
                userId: userId,
                moderatorId: interaction.user.id,
                reason: reason
            });

            await interaction.reply(
                `🔓 **${ban.user.tag}** has been unbanned.\n` +
                `**Reason:** ${reason}\n` +
                `**Moderator:** ${interaction.user.tag}`
            );
        } catch (error) {
            if (error.code === 10026) {
                return interaction.reply({
                    content: "❌ That user isn't currently banned.",
                    ephemeral: true
                });
            }

            console.error(error);

            await interaction.reply({
                content: "❌ I couldn't unban that user.",
                ephemeral: true
            });
        }
    }
};
