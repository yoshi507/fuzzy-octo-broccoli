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
                "All-in-one Discord bot — moderation, AI, music, economy, appeals, and more.\n" +
                    `AI features share **${DAILY_LIMIT} requests per server per day**.\n` +
                    "Staff-only commands require the matching Discord permission (e.g. Ban Members, Manage Server)."
            )
            .addFields(
                {
                    name: "🧠 AI",
                    value:
                        "`/ask` `/chat` `/aisummary` `/aihelp` `/aiassistant`\n" +
                        "`/aimoderate` `/aiincident` `/aisecurity` `/clearmemory`\n" +
                        "Natural: `omni explain photosynthesis` · `omni hello`",
                    inline: false
                },
                {
                    name: "🛡️ Moderation *(staff only)*",
                    value:
                        "`/ban` `/kick` `/timeout` `/warn` `/warnings` `/clearwarnings`\n" +
                        "`/clear` `/lock` `/unlock` `/slowmode` `/modlogs` `/modhistory`\n" +
                        "`/role` `/nick` — require the matching Discord permission",
                    inline: false
                },
                {
                    name: "🤖 AutoMod *(Manage Server)*",
                    value:
                        "`/automod enable` · `disable` · `addword` · `removeword` · `list` · `sync`\n" +
                        "`/automod discord` — toggle Discord native AutoMod sync\n" +
                        "Combines Omni’s filter with **Server Settings → AutoMod** rules",
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
                        "`/volume` `/nowplaying` `/lyrics` `/loop` `/shuffle` `/seek` `/remove`",
                    inline: false
                },
                {
                    name: "⚙️ Server setup *(staff)*",
                    value:
                        "`/welcome` `/goodbye` `/autorole` `/logging` `/deadchat`\n" +
                        "`/suggest` `/poll` `/announce` `/serverinfo` `/userinfo`\n" +
                        "`/reactionrole` `/giveaway` `/autotranslate`",
                    inline: false
                },
                {
                    name: "🎫 Tickets & 📝 Appeals",
                    value:
                        "`/ticketsetup` `/ticketstaff`\n" +
                        "`/appeal` (submit · status · view · accept · reject · list)\n" +
                        "`/appealsetup` — also use the website **Appeal a punishment** button",
                    inline: false
                },
                {
                    name: "🎯 Quizzes",
                    value:
                        "`/quiz start|stop|leaderboard|stats|categories`\n" +
                        "`/quizsetup`",
                    inline: false
                },
                {
                    name: "🎉 Fun & economy",
                    value:
                        "`/coinflip` `/dice` `/rps` `/slots` `/trivia` `/guessnumber` `/higherlower`\n" +
                        "`/daily` `/balance` `/shop` `/buy` `/inventory` `/pay`",
                    inline: false
                },
                {
                    name: "📣 Advertise",
                    value:
                        "`/advertise` · `!advertise` · `omni advertise` — list your server\n" +
                        "Browse public listings on the website **Advertise** button",
                    inline: false
                },
                {
                    name: "🌐 Dashboard",
                    value:
                        "`/dashboard` · `!dashboard` · `omni dashboard`\n" +
                        "https://omnibot.wisp.uno",
                    inline: false
                },
                {
                    name: "ℹ️ Other",
                    value: "`/help` `/ping` `/translate`",
                    inline: false
                }
            )
            .setFooter({
                text: "Prefix and natural commands work too · AI limit resets daily"
            })
            .setColor(0x5865f2);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ embeds: [embed] });
        }
        return interaction.reply({ embeds: [embed] });
    }
};
