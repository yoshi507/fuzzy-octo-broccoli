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
        .setName("automod")
        .setDescription("Configure OmniBot AutoMod")

        .addBooleanOption(option =>
            option
                .setName("enabled")
                .setDescription("Enable or disable AutoMod")
                .setRequired(true)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const enabled =
            interaction.options.getBoolean("enabled");

        const database = loadDatabase();

        if (!database.automod) {
            database.automod = {};
        }

        database.automod[interaction.guild.id] = {
            enabled: enabled
        };

        saveDatabase(database);

        await interaction.reply(
            enabled
                ? "🛡️ AutoMod has been **enabled**."
                : "🛡️ AutoMod has been **disabled**."
        );
    }
};
