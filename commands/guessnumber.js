const { SlashCommandBuilder } = require("discord.js");
const {
    resolveBetAmount,
    placeBet,
    addCoins,
    recordGame
} = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("guessnumber")
        .setDescription("Guess a number 1-10. Correct pays 6x your bet.")
        .addIntegerOption(o =>
            o
                .setName("number")
                .setDescription("Your guess (1-10)")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10)
        )
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Bet amount (or 'all')")
                .setRequired(true)
        ),

    async execute(interaction) {
        const guess = interaction.options.getInteger("number");
        const resolved = resolveBetAmount(
            interaction.guild.id,
            interaction.user.id,
            interaction.options.getString("amount")
        );

        if (!resolved.ok) {
            return interaction.reply({
                content:
                    resolved.reason === "insufficient"
                        ? `❌ Not enough coins (you have **${resolved.coins}**).`
                        : "❌ Invalid bet.",
                ephemeral: true
            });
        }

        const bet = placeBet(
            interaction.guild.id,
            interaction.user.id,
            resolved.amount
        );
        if (!bet.ok) {
            return interaction.reply({ content: "❌ Could not place bet.", ephemeral: true });
        }

        const secret = Math.floor(Math.random() * 10) + 1;
        if (guess === secret) {
            const payout = bet.bet * 6;
            const added = addCoins(interaction.guild.id, interaction.user.id, payout);
            recordGame(interaction.guild.id, interaction.user.id, {
                wagered: bet.bet,
                won: payout,
                win: true
            });
            return interaction.reply(
                `🔢 The number was **${secret}**!\n` +
                    `You guessed it and won **${payout.toLocaleString()}** (6×).\n` +
                    `💰 Balance: **${added.coins.toLocaleString()}**`
            );
        }

        recordGame(interaction.guild.id, interaction.user.id, {
            wagered: bet.bet,
            won: 0,
            win: false
        });
        return interaction.reply(
            `🔢 The number was **${secret}** (you guessed ${guess}).\n` +
                `Lost **${bet.bet.toLocaleString()}**.\n` +
                `💰 Balance: **${bet.coins.toLocaleString()}**`
        );
    }
};
