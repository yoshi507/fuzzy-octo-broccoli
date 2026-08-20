const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { mergeGuildConfig } = require("../utils/configSync.js");

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
        const enabled = interaction.options.getBoolean("enabled");
        mergeGuildConfig("levelSettings", interaction.guild.id, { enabled });
        await interaction.reply(
            enabled
                ? "✅ Leveling has been **enabled**."
                : "✅ Leveling has been **disabled**."
        );
    }
};
