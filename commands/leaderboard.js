const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const { loadDatabase } = require("../database/database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show the server leveling leaderboard"),

    async execute(interaction) {
        const database = loadDatabase();

        const guildLevels =
            database.levels?.[interaction.guild.id] || {};

        const entries = Object.entries(guildLevels)
            .sort((a, b) => {
                if (b[1].level !== a[1].level) {
                    return b[1].level - a[1].level;
                }

                return b[1].xp - a[1].xp;
            })
            .slice(0, 10);

        if (entries.length === 0) {
            return interaction.reply(
                "📊 Nobody has earned any XP yet!"
            );
        }

        const lines = [];

        for (let i = 0; i < entries.length; i++) {
            const [userId, data] = entries[i];

            const member = await interaction.guild.members
                .fetch(userId)
                .catch(() => null);

            const name = member
                ? member.user.username
                : `Unknown User (${userId})`;

            const medal =
                i === 0 ? "🥇" :
                i === 1 ? "🥈" :
                i === 2 ? "🥉" :
                `**${i + 1}.**`;

            lines.push(
                `${medal} **${name}** — Level ${data.level} • ${data.xp} XP`
            );
        }

        const embed = new EmbedBuilder()
            .setTitle("🏆 Leveling Leaderboard")
            .setDescription(lines.join("\n"))
            .setFooter({
                text: "OmniBot • Top 10"
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });
    }
};
