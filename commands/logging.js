const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");

const { mergeGuildConfig } = require("../utils/configSync.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("logging")
        .setDescription("Configure server logging")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Channel where logs should be sent")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel("channel");
        mergeGuildConfig("logging", interaction.guild.id, {
            enabled: true,
            channelId: channel.id
        });
        await interaction.reply({
            content: `✅ Server logging is now enabled in ${channel}.`,
            ephemeral: true
        });
    }
};
