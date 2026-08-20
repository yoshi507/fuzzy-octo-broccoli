const {
    SlashCommandBuilder
} = require("discord.js");

const {
    askAI,
    limitReachedMessage,
    isLimitError,
    replyAiError
} = require("../utils/ai/groq.js");
const { buildGifAwarePayload } = require("../utils/ai/gifReply.js");
const { canUseAI } = require("../utils/ai/aiLimit.js");
const { buildSystemPrompt, DEFAULT_BASE_PROMPT } = require("../utils/persona/store.js");

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
                        content: buildSystemPrompt(interaction.guild.id, DEFAULT_BASE_PROMPT)
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

            const payload = await buildGifAwarePayload(response, { maxGifs: 1 });
            return interaction.editReply(payload);
        } catch (error) {
            return replyAiError(interaction, error, interaction.guild?.id);
        }
    }
};
