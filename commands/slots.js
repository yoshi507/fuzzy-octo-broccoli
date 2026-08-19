const { SlashCommandBuilder } = require("discord.js");
const {
    resolveBetAmount,
    placeBet,
    addCoins,
    recordGame
} = require("../utils/economy.js");

const REELS = ["🍒", "🍋", "🍇", "⭐", "💎", "7️⃣"];

function spin() {
    return [
        REELS[Math.floor(Math.random() * REELS.length)],
        REELS[Math.floor(Math.random() * REELS.length)],
        REELS[Math.floor(Math.random() * REELS.length)]
    ];
}

function multiplier(symbols) {
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
        if (symbols[0] === "7️⃣") return 10;
        if (symbols[0] === "💎") return 7;
        if (symbols[0] === "⭐") return 5;
        return 3;
    }
    if (
        symbols[0] === symbols[1] ||
        symbols[1] === symbols[2] ||
        symbols[0] === symbols[2]
    ) {
        return 1.5;
    }
    return 0;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("slots")
        .setDescription("Spin the Omni slots with OmniCoins")
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Bet amount (or 'all')")
                .setRequired(true)
        ),

    async execute(interaction) {
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

        const symbols = spin();
        const mult = multiplier(symbols);
        const display = `| ${symbols.join(" | ")} |`;

        if (mult > 0) {
            const payout = Math.floor(bet.bet * mult);
            const added = addCoins(interaction.guild.id, interaction.user.id, payout);
            recordGame(interaction.guild.id, interaction.user.id, {
                wagered: bet.bet,
                won: payout,
                win: true
            });
            return interaction.reply(
                `🎰 **SLOTS**\n${display}\n` +
                    `You won **${payout.toLocaleString()}** coins (${mult}×)!\n` +
                    `💰 Balance: **${added.coins.toLocaleString()}**`
            );
        }

        recordGame(interaction.guild.id, interaction.user.id, {
            wagered: bet.bet,
            won: 0,
            win: false
        });
        return interaction.reply(
            `🎰 **SLOTS**\n${display}\n` +
                `No match — lost **${bet.bet.toLocaleString()}**.\n` +
                `💰 Balance: **${bet.coins.toLocaleString()}**`
        );
    }
};
