const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getLeaderboard } = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rich")
        .setDescription("Show the richest members by OmniCoins"),

    async execute(interaction) {
        const board = getLeaderboard(interaction.guild.id, 10);
        if (board.length === 0) {
            return interaction.reply("Nobody has OmniCoins yet. Try `/daily`!");
        }

        const lines = [];
        for (let i = 0; i < board.length; i++) {
            const row = board[i];
            const member = await interaction.guild.members
                .fetch(row.userId)
                .catch(() => null);
            const name = member ? member.user.username : `User ${row.userId}`;
            const medal =
                i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
            lines.push(`${medal} **${name}** — ${row.coins.toLocaleString()} coins`);
        }

        const embed = new EmbedBuilder()
            .setTitle("💎 Richest Members")
            .setDescription(lines.join("\n"))
            .setColor(0xf1c40f);

        await interaction.reply({ embeds: [embed] });
    }
};
