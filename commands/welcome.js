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
        .setName("welcome")
        .setDescription("Configure welcome messages")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Channel for welcome messages")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Welcome message")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel("channel");

        const message =
            interaction.options.getString("message") ||
            "👋 Welcome {user} to **{server}**! You are member **#{membercount}**.";

        mergeGuildConfig("welcomeSettings", interaction.guild.id, {
            enabled: true,
            channelId: channel.id,
            message: message
        });

        await interaction.reply(
            `✅ Welcome messages are now enabled in ${channel}!\n\n` +
            `**Message:** ${message}`
        );
    }
};
