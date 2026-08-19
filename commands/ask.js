const {
    SlashCommandBuilder
} = require("discord.js");

const {
    askAI,
    limitReachedMessage,
    isLimitError,
    replyAiError
} = require("../utils/ai/groq.js");
const { canUseAI } = require("../utils/ai/aiLimit.js");

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

        if (!canUseAI(interaction.guild.id)) {
            return interaction.editReply(limitReachedMessage(interaction.guild.id));
        }

        try {
            const response = await askAI(
                [
                    {
                        role: "system",
                        content: `You are Omni, a friendly Discord bot.\n\nYour personality:\n- Chill\n- Friendly\n- Funny when appropriate\n- Helpful\n- Natural and conversational\n- Do not sound robotic\n- Keep responses reasonably concise\n- Never pretend to be human\n- Respect Discord rules and server rules\n\nYou are being used inside a Discord server.`
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
            return replyAiError(interaction, error, interaction.guild?.id);
        }
    }
};
