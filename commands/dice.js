const { SlashCommandBuilder } = require("discord.js");
const {
    resolveBetAmount,
    placeBet,
    addCoins,
    recordGame
} = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("dice")
        .setDescription("Roll a die (guess 1-6). Correct guess pays 5x.")
        .addIntegerOption(o =>
            o
                .setName("guess")
                .setDescription("Your guess (1-6)")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(6)
        )
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Bet amount (or 'all')")
                .setRequired(true)
        ),

    async execute(interaction) {
        const guess = interaction.options.getInteger("guess");
        const resolved = resolveBetAmount(
            interaction.guild.id,
            interaction.user.id,
            interaction.options.getString("amount")
        );

        if (!resolved.ok) {
            const msg =
                resolved.reason === "insufficient"
                    ? `❌ Not enough coins (you have **${resolved.coins}**).`
                    : `❌ Invalid bet.`;
            return interaction.reply({ content: msg, ephemeral: true });
        }

        const bet = placeBet(
            interaction.guild.id,
            interaction.user.id,
            resolved.amount
        );
        if (!bet.ok) {
            return interaction.reply({ content: "❌ Could not place bet.", ephemeral: true });
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        const win = roll === guess;

        if (win) {
            const payout = bet.bet * 5;
            const added = addCoins(interaction.guild.id, interaction.user.id, payout);
            recordGame(interaction.guild.id, interaction.user.id, {
                wagered: bet.bet,
                won: payout,
                win: true
            });
            return interaction.reply(
                `🎲 You rolled **${roll}** (guessed ${guess})!\n` +
                    `You win **${payout.toLocaleString()}** coins (5×).\n` +
                    `💰 Balance: **${added.coins.toLocaleString()}**`
            );
        }

        recordGame(interaction.guild.id, interaction.user.id, {
            wagered: bet.bet,
            won: 0,
            win: false
        });
        return interaction.reply(
            `🎲 You rolled **${roll}** (guessed ${guess}).\n` +
                `Lost **${bet.bet.toLocaleString()}** coins.\n` +
                `💰 Balance: **${bet.coins.toLocaleString()}**`
        );
    }
};
