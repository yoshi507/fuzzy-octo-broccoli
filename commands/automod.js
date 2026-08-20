const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { mergeGuildConfig } = require("../utils/configSync.js");

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
        const enabled = interaction.options.getBoolean("enabled");
        mergeGuildConfig("automod", interaction.guild.id, { enabled });
        await interaction.reply(
            enabled
                ? "🛡️ AutoMod has been **enabled**."
                : "🛡️ AutoMod has been **disabled**."
        );
    }
};
