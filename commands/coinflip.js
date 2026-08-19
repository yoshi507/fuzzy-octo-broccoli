const { SlashCommandBuilder } = require("discord.js");
const {
    resolveBetAmount,
    placeBet,
    addCoins,
    recordGame
} = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("coinflip")
        .setDescription("Flip a coin and bet OmniCoins")
        .addStringOption(o =>
            o
                .setName("side")
                .setDescription("Heads or tails")
                .setRequired(true)
                .addChoices(
                    { name: "Heads", value: "heads" },
                    { name: "Tails", value: "tails" }
                )
        )
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Bet amount (or 'all')")
                .setRequired(true)
        ),

    async execute(interaction) {
        const side = interaction.options.getString("side");
        const resolved = resolveBetAmount(
            interaction.guild.id,
            interaction.user.id,
            interaction.options.getString("amount")
        );

        if (!resolved.ok) {
            const msg =
                resolved.reason === "insufficient"
                    ? `❌ Not enough coins (you have **${resolved.coins}**).`
                    : resolved.reason === "max_bet"
                      ? `❌ Max bet is **${resolved.max}**.`
                      : `❌ Invalid bet (min **${resolved.min || 1}**).`;
            return interaction.reply({ content: msg, ephemeral: true });
        }

        const bet = placeBet(
            interaction.guild.id,
            interaction.user.id,
            resolved.amount
        );
        if (!bet.ok) {
            return interaction.reply({
                content: "❌ Could not place bet.",
                ephemeral: true
            });
        }

        const result = Math.random() < 0.5 ? "heads" : "tails";
        const win = result === side;

        if (win) {
            const payout = bet.bet * 2;
            const added = addCoins(interaction.guild.id, interaction.user.id, payout);
            recordGame(interaction.guild.id, interaction.user.id, {
                wagered: bet.bet,
                won: payout,
                win: true
            });
            return interaction.reply(
                `🪙 The coin landed on **${result}**!\n` +
                    `You won **${payout.toLocaleString()}** coins.\n` +
                    `💰 Balance: **${added.coins.toLocaleString()}**`
            );
        }

        recordGame(interaction.guild.id, interaction.user.id, {
            wagered: bet.bet,
            won: 0,
            win: false
        });
        return interaction.reply(
            `🪙 The coin landed on **${result}**.\n` +
                `You lost **${bet.bet.toLocaleString()}** coins.\n` +
                `💰 Balance: **${bet.coins.toLocaleString()}**`
        );
    }
};
