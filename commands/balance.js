const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUser } = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("balance")
        .setDescription("Check your OmniCoins balance")
        .addUserOption(o =>
            o.setName("user").setDescription("Whose balance to view").setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser("user") || interaction.user;
        const user = getUser(interaction.guild.id, target.id);

        const embed = new EmbedBuilder()
            .setTitle(`💰 ${target.username}'s Wallet`)
            .setDescription(`**${user.coins.toLocaleString()}** OmniCoins`)
            .addFields(
                {
                    name: "📊 Stats",
                    value:
                        `Games played: **${user.stats?.gamesPlayed || 0}**\n` +
                        `Games won: **${user.stats?.gamesWon || 0}**`,
                    inline: true
                },
                {
                    name: "🔥 Daily streak",
                    value: `**${user.dailyStreak || 0}** day(s)`,
                    inline: true
                }
            )
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .setColor(0xf1c40f);

        await interaction.reply({ embeds: [embed] });
    }
};
