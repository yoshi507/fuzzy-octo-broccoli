const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");
const { DAILY_LIMIT } = require("../utils/ai/aiLimit.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show OmniBot commands and features"),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle("🤖 OmniBot Help")
            .setDescription(
                "All-in-one Discord bot with moderation, leveling, music, and AI tools.\n" +
                `AI features share **${DAILY_LIMIT} requests per server per day**.`
            )
            .addFields(
                {
                    name: "🧠 AI",
                    value:
                        "`/ask` `/chat` `/aisummary` `/aihelp` `/aiassistant`\n" +
                        "`/aimoderate` `/aiincident` `/aisecurity` `/clearmemory`\n" +
                        "Use `/aihelp` to ask how a feature works.",
                    inline: false
                },
                {
                    name: "🛡️ Moderation",
                    value:
                        "`/ban` `/kick` `/timeout` `/warn` `/warnings` `/clearwarnings`\n" +
                        "`/clear` `/lock` `/unlock` `/slowmode` `/automod` `/modlogs`",
                    inline: false
                },
                {
                    name: "📈 Leveling",
                    value: "`/rank` `/leaderboard` `/levelsettings` `/levelrole`",
                    inline: false
                },
                {
                    name: "🎵 Music",
                    value:
                        "`/play` `/skip` `/stop` `/queue` `/pause` `/resume`\n" +
                        "`/volume` `/nowplaying` `/lyrics`",
                    inline: false
                },
                {
                    name: "⚙️ Server",
                    value:
                        "`/welcome` `/goodbye` `/autorole` `/logging` `/deadchat`\n" +
                        "`/suggest` `/poll` `/announce` `/serverinfo` `/userinfo`",
                    inline: false
                },
                {
                    name: "🎫 Tickets",
                    value: "`/ticketsetup` `/ticketstaff`",
                    inline: false
                },
                {
                    name: "🔧 Utility",
                    value: "`/ping` `/help` `/translate` `/autotranslate`",
                    inline: false
                }
            )
            .setFooter({
                text: "OmniBot • AI tools use a shared daily server limit"
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
