const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

const { mergeGuildConfig } = require("../utils/configSync.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("goodbye")
        .setDescription("Configure goodbye messages")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Channel for goodbye messages")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Goodbye message")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel("channel");

        const message =
            interaction.options.getString("message") ||
            "👋 **{username}** left **{server}**.";

        mergeGuildConfig("goodbyeSettings", interaction.guild.id, {
            enabled: true,
            channelId: channel.id,
            message: message
        });

        await interaction.reply(
            `✅ Goodbye messages are now enabled in ${channel}!\n\n` +
            `**Message:** ${message}`
        );
    }
};
