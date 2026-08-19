const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show all of OmniBot's commands"),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle("🤖 OmniBot Help")
            .setDescription(
                "Your all-in-one Discord bot.\n\n" +
                "More features are being added!"
            )
            .addFields(
                {
                    name: "🛡️ Moderation",
                    value: "`/ban` `/kick` `/timeout` `/warn`\nComing soon",
                    inline: false
                },
                {
                    name: "📈 Leveling",
                    value: "`/rank` `/leaderboard`\nComing soon",
                    inline: false
                },
                {
                    name: "❤️ Social",
                    value: "`/marry` `/divorce` `/couple`\nComing soon",
                    inline: false
                },
                {
                    name: "🎫 Tickets",
                    value: "Ticket system coming soon",
                    inline: false
                },
                {
                    name: "💰 Economy",
                    value: "Economy system coming soon",
                    inline: false
                },
                {
                    name: "🎉 Fun",
                    value: "Fun commands coming soon",
                    inline: false
                },
                {
                    name: "⚙️ Utility",
                    value: "`/ping` `/help`",
                    inline: false
                }
            )
            .setFooter({
                text: "OmniBot • All your Discord tools in one bot"
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
