const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const { DASHBOARD_URL } = require("../config/botConfig.js");

function resolveDashboardUrl() {
    let url = String(
        process.env.DASHBOARD_URL ||
            DASHBOARD_URL ||
            "https://omnibot.wisp.uno"
    ).trim();

    // Never point users at the old IP/port or GitHub Pages dashboard
    if (/78\.154\.103\.20/i.test(url) || /github\.io/i.test(url)) {
        url = "https://omnibot.wisp.uno";
    }

    url = url.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(url)) {
        url = "https://omnibot.wisp.uno";
    }

    return url;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dashboard")
        .setDescription("Open the OmniBot web dashboard"),

    async execute(interaction) {
        const url = resolveDashboardUrl();

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("OmniBot Dashboard")
            .setDescription(
                "Manage your server settings in the browser — AI, moderation, appeals, quizzes, and more.\n\n" +
                    "Log in with Discord, then choose a server you can manage. " +
                    "Permissions are verified by OmniBot's API, not by this link alone."
            )
            .addFields({
                name: "Dashboard",
                value: `[Open OmniBot Dashboard](${url})`
            })
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
