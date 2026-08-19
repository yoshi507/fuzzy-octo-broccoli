const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    loadDatabase
} = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("View a member's warning history")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member whose warnings you want to view")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    async execute(interaction) {
        const user = interaction.options.getUser("user");
        const database = loadDatabase();

        const warnings = database.warnings.filter(
            warning =>
                warning.guildId === interaction.guild.id &&
                warning.userId === user.id
        );

        if (warnings.length === 0) {
            return interaction.reply(
                `✅ **${user.tag}** has no warnings.`
            );
        }

        const list = warnings
            .map(warning => {
                const date = new Date(warning.createdAt);

                return (
                    `**Warning #${warning.id}**\n` +
                    `Reason: ${warning.reason}\n` +
                    `Moderator: <@${warning.moderatorId}>\n` +
                    `Date: ${date.toLocaleString("en-GB")}`
                );
            })
            .join("\n\n");

        await interaction.reply(
            `🛡️ **Warning History — ${user.tag}**\n\n` +
            `${list}\n\n` +
            `**Total warnings: ${warnings.length}**`
        );
    }
};
