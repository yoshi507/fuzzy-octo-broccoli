const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ticketsetup")
        .setDescription("Create a ticket panel")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("Channel where the ticket panel should be sent")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        const channel =
            interaction.options.getChannel("channel");

        const database = loadDatabase();

        if (!database.ticketSettings) {
            database.ticketSettings = {};
        }

        const previous = database.ticketSettings[interaction.guild.id] || {};
        database.ticketSettings[interaction.guild.id] = {
            ...previous,
            enabled: true,
            panelChannelId: channel.id,
            staffRoleIds: previous.staffRoleIds || []
        };

        saveDatabase(database);

        const embed = new EmbedBuilder()
            .setTitle("🎫 Support Tickets")
            .setDescription(
                "Need help? Click the button below to create a private support ticket."
            )
            .setFooter({
                text: "OmniBot • Ticket System"
            });

        const button = new ButtonBuilder()
            .setCustomId("create_ticket")
            .setLabel("Create Ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder()
            .addComponents(button);

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        await interaction.reply({
            content: `✅ Ticket panel created in ${channel}.`,
            ephemeral: true
        });
    }
};
