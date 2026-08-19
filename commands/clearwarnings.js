const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clearwarnings")
        .setDescription("Clear all warnings for a member")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("The member whose warnings should be cleared")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    async execute(interaction) {
        const user = interaction.options.getUser("user");
        const database = loadDatabase();

        const before = database.warnings.length;

        database.warnings = database.warnings.filter(
            warning =>
                !(
                    warning.guildId === interaction.guild.id &&
                    warning.userId === user.id
                )
        );

        const removed = before - database.warnings.length;

        if (removed === 0) {
            return interaction.reply({
                content: `ℹ️ **${user.tag}** has no warnings to clear.`,
                ephemeral: true
            });
        }

        saveDatabase(database);

        await interaction.reply(
            `✅ Cleared **${removed}** warning(s) from **${user.tag}**.`
        );
    }
};
