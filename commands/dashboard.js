const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const { DASHBOARD_URL } = require("../config/botConfig.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dashboard")
        .setDescription("Open the OmniBot web dashboard"),

    async execute(interaction) {
        const url = String(DASHBOARD_URL || "https://yoshi507.github.io/OmniBot/").trim();

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("OmniBot Dashboard")
            .setDescription(
                "Manage your server settings in the browser — AI, moderation, appeals, quizzes, and more.\n\n" +
                    "After login, pick a server you can manage. Permissions are checked on the server, not by this link."
            )
            .setFooter({ text: "No bot tokens are stored in the dashboard" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Open OmniBot Dashboard")
                .setStyle(ButtonStyle.Link)
                .setURL(url)
        );

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }
};
