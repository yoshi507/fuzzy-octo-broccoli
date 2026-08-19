const {
    SlashCommandBuilder
} = require("discord.js");

const {
    askAI,
    limitReachedMessage,
    isLimitError,
    getRemaining,
    DAILY_LIMIT
} = require("../utils/ai/groq.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask Omni an AI question")
        .addStringOption(option =>
            option
                .setName("question")
                .setDescription("What do you want to ask Omni?")
                .setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString("question");

        await interaction.deferReply();

        try {
            const response = await askAI(
                [
                    {
                        role: "system",
                        content: `You are Omni, a friendly Discord bot.

Your personality:
- Chill
- Friendly
- Funny when appropriate
- Helpful
- Natural and conversational
- Do not sound robotic
- Keep responses reasonably concise
- Never pretend to be human
- Respect Discord rules and server rules

You are being used inside a Discord server.`
                    },
                    {
                        role: "user",
                        content: question
                    }
                ],
                {
                    guildId: interaction.guild.id,
                    temperature: 0.8,
                    maxTokens: 1000
                }
            );

            if (!response) {
                return interaction.editReply(
                    "❌ Omni didn't return a response."
                );
            }

            const maxLength = 1900;

            if (response.length <= maxLength) {
                return interaction.editReply(response);
            }

            await interaction.editReply(response.slice(0, maxLength));

            for (let i = maxLength; i < response.length; i += maxLength) {
                await interaction.followUp(response.slice(i, i + maxLength));
            }
        } catch (error) {
            if (isLimitError(error)) {
                return interaction.editReply(limitReachedMessage());
            }

            console.error("AI command error:", error);

            await interaction.editReply(
                "❌ I couldn't reach Omni's AI right now."
            );
        }
    }
};
