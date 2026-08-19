const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("privacy")
        .setDescription("View OmniBot Privacy Policy summary"),

    async execute(interaction) {
        const site = "https://yoshi507.github.io/Omnibot-dashboard/";
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("OmniBot — Privacy (summary)")
            .setDescription(
                "This describes data OmniBot actually processes based on its features."
            )
            .addFields(
                {
                    name: "Data we process",
                    value:
                        "• Discord user IDs, usernames, and message content when needed for commands, moderation, leveling, tickets, appeals, quizzes, economy, and logging\n" +
                        "• Guild/channel/role IDs for configuration\n" +
                        "• Optional AI prompts/responses when AI features are used\n" +
                        "• Dashboard sessions when you log in via Discord OAuth"
                },
                {
                    name: "Storage",
                    value:
                        "Configuration and feature data are stored per Discord **guild ID** on the bot host. AI providers process prompts when AI features are invoked."
                },
                {
                    name: "What we do not do",
                    value:
                        "OmniBot does not sell your data. The public dashboard never receives the bot token or OAuth client secret."
                },
                {
                    name: "Operator contact",
                    value:
                        "**[OPERATOR CONTACT EMAIL — PLACEHOLDER]**\n**[DATA RETENTION PERIOD — PLACEHOLDER]**"
                },
                {
                    name: "More",
                    value: `[Website](${site}) · \`/terms\` for terms summary.`
                }
            )
            .setFooter({ text: "Not legal advice — placeholders must be completed by the operator." });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
