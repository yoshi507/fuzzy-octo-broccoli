const { SlashCommandBuilder, ChannelType } = require("discord.js");
const {
    askAI,
    limitReachedMessage,
    isLimitError,
    replyAiError,
    DAILY_LIMIT,
    getRemaining
} = require("../utils/ai/groq.js");
const { canUseAI } = require("../utils/ai/aiLimit.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aiassistant")
        .setDescription("Ask Omni about this server or Discord topics")
        .addStringOption(option =>
            option
                .setName("question")
                .setDescription("Your question")
                .setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString("question");
        await interaction.deferReply();

        if (!canUseAI(interaction.guild.id)) {
            return interaction.editReply(limitReachedMessage(interaction.guild.id));
        }

        try {
            const guild = interaction.guild;

            const textChannels = guild.channels.cache.filter(
                c => c.type === ChannelType.GuildText
            ).size;
            const voiceChannels = guild.channels.cache.filter(
                c => c.type === ChannelType.GuildVoice
            ).size;
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
                            "You are Omni, a Discord server assistant.\n" +
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
            const text =
                answer.length > 1900 ? answer.slice(0, 1900) : answer;

            await interaction.editReply(
                `${text}\n\n_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`
            );
        } catch (error) {
            return replyAiError(interaction, error, interaction.guild?.id);
        }
    }
};
