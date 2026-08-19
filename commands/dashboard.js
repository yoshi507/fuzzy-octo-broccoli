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
        let url = String(
            process.env.DASHBOARD_URL ||
                DASHBOARD_URL ||
                "https://yoshi507.github.io/Omnibot-dashboard/#/login"
        ).trim();

        if (interaction.guildId && url.includes("#/")) {
            url = url.replace(/#\/.*/, `#/login?guild=${interaction.guildId}`);
        }

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
                .setURL("https://yoshi507.github.io/Omnibot-dashboard/#/login")
        );

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }
};
