const { SlashCommandBuilder } = require("discord.js");
const { claimDaily, DAILY_REWARD } = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("daily")
        .setDescription("Claim your daily OmniCoins reward"),

    async execute(interaction) {
        const result = claimDaily(interaction.guild.id, interaction.user.id);

        if (!result.claimed) {
            return interaction.reply({
                content:
                    "⏳ You already claimed your daily reward today. Come back tomorrow!",
                ephemeral: true
            });
        }

        await interaction.reply(
            `🎁 **Daily claimed!**\n` +
                `You received **${result.reward}** OmniCoins` +
                (result.bonus
                    ? ` (base ${DAILY_REWARD} + streak bonus ${result.bonus})`
                    : "") +
                `\n🔥 Streak: **${result.streak}** day(s)\n` +
                `💰 Balance: **${result.coins.toLocaleString()}**`
        );
    }
};
