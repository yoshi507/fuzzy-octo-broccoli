const { SlashCommandBuilder } = require("discord.js");
const {
    resolveBetAmount,
    placeBet,
    addCoins,
    recordGame
} = require("../utils/economy.js");

const CHOICES = ["rock", "paper", "scissors"];
const BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };

module.exports = {
    data: new SlashCommandBuilder()
        .setName("rps")
        .setDescription("Rock paper scissors for OmniCoins")
        .addStringOption(o =>
            o
                .setName("choice")
                .setDescription("Your move")
                .setRequired(true)
                .addChoices(
                    { name: "Rock", value: "rock" },
                    { name: "Paper", value: "paper" },
                    { name: "Scissors", value: "scissors" }
                )
        )
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Bet amount (or 'all')")
                .setRequired(true)
        ),

    async execute(interaction) {
        const choice = interaction.options.getString("choice");
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

        const bot = CHOICES[Math.floor(Math.random() * CHOICES.length)];
        let outcome = "tie";
        if (choice === bot) outcome = "tie";
        else if (BEATS[choice] === bot) outcome = "win";
        else outcome = "lose";

        if (outcome === "tie") {
            addCoins(interaction.guild.id, interaction.user.id, bet.bet);
            recordGame(interaction.guild.id, interaction.user.id, {
                wagered: bet.bet,
                won: bet.bet,
                win: false
            });
            return interaction.reply(
                `✊ You: **${choice}** · Omni: **${bot}**\nIt's a tie — stake returned.`
            );
        }

        if (outcome === "win") {
            const payout = bet.bet * 2;
            const added = addCoins(interaction.guild.id, interaction.user.id, payout);
            recordGame(interaction.guild.id, interaction.user.id, {
                wagered: bet.bet,
                won: payout,
                win: true
            });
            return interaction.reply(
                `✊ You: **${choice}** · Omni: **${bot}**\nYou win **${payout.toLocaleString()}**!\n💰 Balance: **${added.coins.toLocaleString()}**`
            );
        }

        recordGame(interaction.guild.id, interaction.user.id, {
            wagered: bet.bet,
            won: 0,
            win: false
        });
        return interaction.reply(
            `✊ You: **${choice}** · Omni: **${bot}**\nYou lost **${bet.bet.toLocaleString()}**.\n💰 Balance: **${bet.coins.toLocaleString()}**`
        );
    }
};
