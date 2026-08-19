const { SlashCommandBuilder } = require("discord.js");
const {
    resolveBetAmount,
    placeBet,
    addCoins,
    recordGame
} = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("higherlower")
        .setDescription("Guess if the next number (1-100) is higher or lower")
        .addStringOption(o =>
            o
                .setName("guess")
                .setDescription("Higher or lower than the shown number")
                .setRequired(true)
                .addChoices(
                    { name: "Higher", value: "higher" },
                    { name: "Lower", value: "lower" }
                )
        )
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Bet amount (or 'all')")
                .setRequired(true)
        ),

    async execute(interaction) {
        const guess = interaction.options.getString("guess");
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

        let current = Math.floor(Math.random() * 100) + 1;
        let next = Math.floor(Math.random() * 100) + 1;
        while (next === current) {
            next = Math.floor(Math.random() * 100) + 1;
        }

        const actuallyHigher = next > current;
        const win =
            (guess === "higher" && actuallyHigher) ||
            (guess === "lower" && !actuallyHigher);

        if (win) {
            const payout = bet.bet * 2;
            const added = addCoins(interaction.guild.id, interaction.user.id, payout);
            recordGame(interaction.guild.id, interaction.user.id, {
                wagered: bet.bet,
                won: payout,
                win: true
            });
            return interaction.reply(
                `📶 Starting number: **${current}**\n` +
                    `Next number: **${next}**\n` +
                    `You guessed **${guess}** and won **${payout.toLocaleString()}**!\n` +
                    `💰 Balance: **${added.coins.toLocaleString()}**`
            );
        }

        recordGame(interaction.guild.id, interaction.user.id, {
            wagered: bet.bet,
            won: 0,
            win: false
        });
        return interaction.reply(
            `📶 Starting number: **${current}**\n` +
                `Next number: **${next}**\n` +
                `You guessed **${guess}** and lost **${bet.bet.toLocaleString()}**.\n` +
                `💰 Balance: **${bet.coins.toLocaleString()}**`
        );
    }
};
