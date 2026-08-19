const { SlashCommandBuilder } = require("discord.js");
const { doWork } = require("../utils/economy.js");

const JOBS = [
    "delivered packages",
    "washed dishes",
    "walked dogs",
    "sorted mail",
    "helped at a market stall",
    "fixed a squeaky door",
    "organized a bookshelf",
    "watered plants"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("work")
        .setDescription("Do a quick job for OmniCoins (1 hour cooldown)"),

    async execute(interaction) {
        const result = doWork(interaction.guild.id, interaction.user.id);

        if (!result.ok) {
            const mins = Math.ceil((result.remainingMs || 0) / 60000);
            return interaction.reply({
                content: `😴 You're tired. Try again in about **${mins}** minute(s).`,
                ephemeral: true
            });
        }

        const job = JOBS[Math.floor(Math.random() * JOBS.length)];

        await interaction.reply(
            `🛠️ You ${job} and earned **${result.reward}** OmniCoins!\n` +
                `💰 Balance: **${result.coins.toLocaleString()}**`
        );
    }
};
