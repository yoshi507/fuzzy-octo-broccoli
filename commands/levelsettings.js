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
        .setName("levelsettings")
        .setDescription("Configure the server leveling system")
        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Enable or disable leveling")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const enabled =
            interaction.options.getBoolean("enabled");

        const database = loadDatabase();

        if (!database.levelSettings) {
            database.levelSettings = {};
        }

        database.levelSettings[interaction.guild.id] = {
            enabled: enabled
        };

        saveDatabase(database);

        await interaction.reply(
            enabled
                ? "✅ Leveling has been **enabled**."
                : "✅ Leveling has been **disabled**."
        );
    }
};
