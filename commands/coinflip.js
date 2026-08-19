const { SlashCommandBuilder } = require("discord.js");
const {
    resolveBetAmount,
    placeBet,
    addCoins,
    recordGame,
    getBalance
} = require("../utils/economy.js");

function normalizeSide(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim().toLowerCase();
    if (["h", "head", "heads"].includes(s)) return "heads";
    if (["t", "tail", "tails"].includes(s)) return "tails";
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("coinflip")
        .setDescription("Flip a coin — optionally bet OmniCoins")
        .addStringOption(o =>
            o
                .setName("side")
                .setDescription("Heads or tails (optional for fun flips)")
                .setRequired(false)
                .addChoices(
                    { name: "Heads", value: "heads" },
                    { name: "Tails", value: "tails" }
                )
        )
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Bet amount or 'all' (optional)")
                .setRequired(false)
        ),

    async execute(interaction) {
        const sideRaw = interaction.options.getString("side");
        const amountRaw = interaction.options.getString("amount");
        const side = normalizeSide(sideRaw);

        if (!amountRaw && !sideRaw) {
            const result = Math.random() < 0.5 ? "heads" : "tails";
            return interaction.reply(`🪙 The coin landed on **${result}**!`);
        }

        if (!amountRaw && side) {
            const result = Math.random() < 0.5 ? "heads" : "tails";
            const win = result === side;
            return interaction.reply(
                win
                    ? `🪙 **${result}** — you called it!`
                    : `🪙 **${result}** — better luck next time (you picked **${side}**).`
            );
        }

        if (!side) {
            return interaction.reply({
                content:
                    "❌ Pick a side: **heads** or **tails**.\n" +
                    "Examples: `/coinflip side:Heads amount:10` · `!coinflip heads 10` · `omni coinflip tails 5`",
                ephemeral: true
            });
        }

        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ Coinflip bets only work in a server.",
                ephemeral: true
            });
        }

        const resolved = resolveBetAmount(
            interaction.guild.id,
            interaction.user.id,
            amountRaw
        );

        if (!resolved.ok) {
            const msg =
                resolved.reason === "insufficient"
                    ? `❌ Not enough coins (you have **${resolved.coins}**).`
                    : resolved.reason === "max_bet"
                      ? `❌ Max bet is **${resolved.max}**.`
                      : `❌ Invalid bet amount (min **${resolved.min || 1}**). Try a number or \`all\`.`;
            return interaction.reply({ content: msg, ephemeral: true });
        }

        const bet = placeBet(
            interaction.guild.id,
            interaction.user.id,
            resolved.amount
        );
        if (!bet.ok) {
            return interaction.reply({
                content: "❌ Could not place that bet. Try again.",
                ephemeral: true
            });
        }

        const result = Math.random() < 0.5 ? "heads" : "tails";
        const win = result === side;

        if (win) {
            const payout = bet.bet * 2;
            const added = addCoins(
                interaction.guild.id,
                interaction.user.id,
                payout
            );
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
        const bal = getBalance(interaction.guild.id, interaction.user.id);
        return interaction.reply(
            `🪙 The coin landed on **${result}**.\n` +
                `You lost **${bet.bet.toLocaleString()}** coins.\n` +
                `💰 Balance: **${bal.coins.toLocaleString()}**`
        );
    }
};
