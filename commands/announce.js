const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("announce")
        .setDescription("Send an announcement")
        .addStringOption(option =>
            option
                .setName("title")
                .setDescription("Announcement title")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Announcement message")
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("Optional role to ping")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const title =
            interaction.options.getString("title");

        const message =
            interaction.options.getString("message");

        const role =
            interaction.options.getRole("role");

        const embed =
            new EmbedBuilder()
                .setTitle(`📢 ${title}`)
                .setDescription(message)
                .setFooter({
                    text: `Posted by ${interaction.user.tag}`
                })
                .setTimestamp();

        try {
            await interaction.channel.send({
                content: role ? `${role}` : undefined,
                embeds: [embed]
            });

            await sendModLog(interaction.guild, {
                title: "📢 Announcement Sent",
                description:
                    `${interaction.user} sent an announcement in ${interaction.channel}.`,
                userId: interaction.user.id,
                moderatorId: interaction.user.id,
                reason: `Announcement: ${title}`
            });

            await interaction.reply({
                content: "✅ Announcement sent!",
                ephemeral: true
            });

        } catch (error) {
            console.error(
                "Announcement error:",
                error
            );

            await interaction.reply({
                content:
                    "❌ I couldn't send the announcement.",
                ephemeral: true
            });
        }
    }
};
