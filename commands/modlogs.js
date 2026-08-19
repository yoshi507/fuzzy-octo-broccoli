const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("modlogs")
        .setDescription("Set the channel for moderation logs")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Channel where moderation logs should be sent")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel("channel");

        const database = loadDatabase();

        if (!database.settings) {
            database.settings = {};
        }

        if (!database.settings[interaction.guild.id]) {
            database.settings[interaction.guild.id] = {};
        }

        database.settings[interaction.guild.id].modLogChannel =
            channel.id;

        saveDatabase(database);

        await interaction.reply(
            `✅ Moderation logs are now enabled in ${channel}.`
        );
    }
};
