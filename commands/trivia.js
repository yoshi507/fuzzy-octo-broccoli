const { SlashCommandBuilder } = require("discord.js");
const { addCoins, recordGame } = require("../utils/economy.js");
const QUESTIONS = require("../utils/games/triviaQuestions.js");

const active = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("trivia")
        .setDescription("Answer a trivia question for OmniCoins (free to play)"),

    async execute(interaction) {
        const key = interaction.channel.id;
        if (active.has(key)) {
            return interaction.reply({
                content: "⏳ A trivia round is already active in this channel.",
                ephemeral: true
            });
        }

        const item = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        const reward = 40 + Math.floor(Math.random() * 41);

        await interaction.reply(
            `🧠 **Trivia time!**\n${item.q}\n\n` +
                `First correct answer in this channel within **20 seconds** wins **${reward}** OmniCoins.`
        );

        const filter = m =>
            !m.author.bot &&
            m.channel.id === interaction.channel.id &&
            item.a.some(
                ans =>
                    m.content.trim().toLowerCase() === ans.toLowerCase()
            );

        const collector = interaction.channel.createMessageCollector({
            filter,
            time: 20000,
            max: 1
        });

        active.set(key, true);

        collector.on("collect", async message => {
            const added = addCoins(
                interaction.guild.id,
                message.author.id,
                reward
            );
            recordGame(interaction.guild.id, message.author.id, {
                wagered: 0,
                won: reward,
                win: true
            });
            await message.reply(
                `✅ Correct, ${message.author}! You earned **${reward}** coins.\n` +
                    `💰 Balance: **${added.coins.toLocaleString()}**`
            );
        });

        collector.on("end", async collected => {
            active.delete(key);
            if (collected.size === 0) {
                await interaction.followUp(
                    `⏰ Time's up! Acceptable answer(s): **${item.a[0]}**`
                ).catch(() => {});
            }
        });
    }
};
