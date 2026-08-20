const { SlashCommandBuilder } = require("discord.js");

const { buildSystemPrompt, DEFAULT_BASE_PROMPT } = require("../utils/persona/store.js");
const {
    askAI,
    limitReachedMessage,
    isLimitError,
    replyAiError,
    getRemaining,
    DAILY_LIMIT
} = require("../utils/ai/groq.js");
const { canUseAI } = require("../utils/ai/aiLimit.js");
const { buildGifAwarePayload } = require("../utils/ai/gifReply.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aiassistant")
        .setDescription("Ask Omni about this Discord server")
        .addStringOption((option) =>
            option
                .setName("question")
                .setDescription("What do you want to know?")
                .setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString("question");

        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ This command only works in a server.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        if (!canUseAI(interaction.guild.id)) {
            return interaction.editReply(limitReachedMessage(interaction.guild.id));
        }

        try {
            const guild = interaction.guild;
            const textChannels = guild.channels.cache.filter((c) => c.isTextBased?.()).size;
            const voiceChannels = guild.channels.cache.filter((c) => c.isVoiceBased?.()).size;
            const roles = guild.roles.cache.size;

            const serverContext = [
                `Server name: ${guild.name}`,
                `Member count: ${guild.memberCount}`,
                `Created: ${guild.createdAt.toISOString().slice(0, 10)}`,
                `Text channels (approx): ${textChannels}`,
                `Voice channels (approx): ${voiceChannels}`,
                `Role count: ${roles}`,
                `Boost tier: ${guild.premiumTier}`,
                `Boost count: ${guild.premiumSubscriptionCount || 0}`,
                `Verification level: ${guild.verificationLevel}`
            ].join("\n");

            const answer = await askAI(
                [
                    {
                        role: "system",
                        content:
                            buildSystemPrompt(interaction.guild.id, DEFAULT_BASE_PROMPT) +
                            "\n\nYou are assisting with this Discord server.\n" +
                            "Use only the provided public server metadata when talking about this server.\n" +
                            "Do NOT invent private data, member lists, message contents, or audit details.\n" +
                            "If the question needs private info you do not have, say so clearly.\n" +
                            "You may answer general Discord how-to questions.\n" +
                            "Keep answers concise and helpful.\n\n" +
                            "Public server metadata:\n" +
                            serverContext
                    },
                    {
                        role: "user",
                        content: question
                    }
                ],
                {
                    guildId: interaction.guild.id,
                    temperature: 0.5,
                    maxTokens: 800
                }
            );

            if (!answer) {
                return interaction.editReply("❌ Omni didn't return an answer.");
            }

            const remaining = getRemaining(interaction.guild.id);
            const payload = await buildGifAwarePayload(answer, { maxGifs: 1 });
            const suffix = `\n\n_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`;
            if (payload.content) {
                payload.content = (payload.content + suffix).slice(0, 2000);
            } else {
                payload.content = suffix.trim();
            }
            await interaction.editReply(payload);
        } catch (error) {
            if (isLimitError(error)) {
                return replyAiError(interaction, error, interaction.guild.id);
            }
            console.error("aiassistant error:", error?.code || error?.message || error);
            return replyAiError(interaction, error, interaction.guild.id);
        }
    }
};
