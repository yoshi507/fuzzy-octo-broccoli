const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("terms")
        .setDescription("View OmniBot Terms of Service summary"),

    async execute(interaction) {
        const site = "https://yoshi507.github.io/Omnibot-dashboard/";
        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("OmniBot — Terms of Service (summary)")
            .setDescription(
                "By using OmniBot you agree to use it in line with [Discord's Terms](https://discord.com/terms) and these conditions."
            )
            .addFields(
                {
                    name: "Acceptable use",
                    value:
                        "Do not use OmniBot to harass, spam, evade bans, break Discord rules, or violate the law. Server admins are responsible for how features are configured in their guild."
                },
                {
                    name: "Service availability",
                    value:
                        "OmniBot is provided as-is. Features may change, rate limits apply (including AI daily limits), and uptime is not guaranteed."
                },
                {
                    name: "Operator",
                    value:
                        "**[OPERATOR LEGAL NAME / CONTACT — PLACEHOLDER]**\nReplace this with the bot operator's identity and contact email."
                },
                {
                    name: "Full policies",
                    value: `[Dashboard / site](${site}) · Use \`/privacy\` for privacy details.`
                }
            )
            .setFooter({ text: "Not legal advice — placeholders must be completed by the operator." });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
