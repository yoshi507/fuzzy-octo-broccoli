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

const {
    getConversation,
    addMessage
} = require("../utils/ai/memory.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("chat")
        .setDescription("Have a conversation with Omni")
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("What do you want to say?")
                .setRequired(true)
        ),

    async execute(interaction) {
        const message = interaction.options.getString("message");

        await interaction.deferReply();

        if (!canUseAI(interaction.guild.id)) {
            return interaction.editReply(limitReachedMessage(interaction.guild.id));
        }

        try {
            const history = getConversation(
                interaction.guild.id,
                interaction.user.id
            );

            const messages = [
                {
                    role: "system",
                    content: buildSystemPrompt(interaction.guild.id, DEFAULT_BASE_PROMPT)
                },
                ...history.map(item => ({
                    role: item.role,
                    content: item.content
                })),
                {
                    role: "user",
                    content: message
                }
            ];

            const response = await askAI(messages, {
                temperature: 0.8,
                guildId: interaction.guild.id,
                maxTokens: 1000
            });

            if (!response) {
                return interaction.editReply(
                    "❌ Omni didn't return a response."
                );
            }

            addMessage(
                interaction.guild.id,
                interaction.user.id,
                "user",
                message
            );

            addMessage(
                interaction.guild.id,
                interaction.user.id,
                "assistant",
                response
            );

            const payload = await buildGifAwarePayload(response, { maxGifs: 1 });
            return interaction.editReply(payload);
        } catch (error) {
            return replyAiError(interaction, error, interaction.guild?.id);
        }
    }
};
