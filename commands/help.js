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
                        "`/aimoderate` `/aiincident` `/aisecurity` `/clearmemory` `/imagine`\n" +
                        "Natural: `omni explain photosynthesis` · Image: `/imagine` or `omni imagine a sunset`",
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
                    name: "🎮 Games & economy",
                    value:
                        "`/balance` `/daily` `/work` `/pay` `/shop` `/buy` `/inventory` `/rich`\n" +
                        "`/coinflip` `/dice` `/rps` `/slots` `/trivia` `/guessnumber` `/higherlower`",
                    inline: false
                },
                {
                    name: "📢 Advertise",
                    value:
                        "`/advertise publish|unpublish|status` — list your server on the website directory\n" +
                        "Browse listings on the site → **Advertise** (no login required)",
                    inline: false
                },
                {
                    name: "🔧 Utility",
                    value:
                        "`/ping` `/help` `/dashboard` `/translate` `/privacy` `/terms`",
                    inline: false
                },
                {
                    name: "💬 Text & natural commands",
                    value:
                        "Prefix: `!command` · Natural: `omni …` / `omnibot …` (or the bot’s nickname)\n" +
                        "Examples: `!help` · `omni help` · `omni dashboard` · `gary help` (if nicknamed)\n" +
                        "Staff commands still require Discord permissions — regular members cannot use them.",
                    inline: false
                }
            )
            .setFooter({
                text: "OmniBot • Dashboard: https://omnibot.wisp.uno"
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
