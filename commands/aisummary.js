const { SlashCommandBuilder } = require("discord.js");
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
        .setName("aisummary")
        .setDescription("Get an AI summary of recent channel activity")
        .addIntegerOption(option =>
            option
                .setName("messages")
                .setDescription("How many recent messages to scan (default 40, max 80)")
                .setMinValue(10)
                .setMaxValue(80)
                .setRequired(false)
        ),

    async execute(interaction) {
        const limit = interaction.options.getInteger("messages") || 40;
        await interaction.deferReply();

        if (!canUseAI(interaction.guild.id)) {
            return interaction.editReply(limitReachedMessage(interaction.guild.id));
        }

        try {
            const messages = await interaction.channel.messages.fetch({
                limit
            });

            const sorted = [...messages.values()].sort(
                (a, b) => a.createdTimestamp - b.createdTimestamp
            );

            const usable = sorted.filter(
                message =>
                    !message.author.bot &&
                    message.content &&
                    message.content.trim().length > 0
            );

            if (usable.length < 3) {
                return interaction.editReply(
                    "🗭 There aren't enough recent messages to summarise."
                );
            }

            const transcript = usable
                .slice(-40)
                .map(
                    message =>
                        `${message.author.username}: ${message.content.slice(0, 300)}`
                )
                .join("\n");

            const summary = await askAI(
                [
                    {
                        role: "system",
                        content:
                            "You summarise Discord conversations accurately and concisely. Never invent details."
                    },
                    {
                        role: "user",
                        content:
                            "Summarise this Discord conversation for someone who just joined.\n" +
                            "Rules:\n" +
                            "- Main topics only\n" +
                            "- Important decisions or events\n" +
                            "- Ignore greetings and noise\n" +
                            "- Use short bullet points\n" +
                            "- End with one sentence on the current topic\n\n" +
                            `Conversation:\n${transcript}`
                    }
                ],
                {
                    guildId: interaction.guild.id,
                    temperature: 0.3,
                    maxTokens: 700
                }
            );

            if (!summary) {
                return interaction.editReply("❌ I couldn't create a summary.");
            }

            const remaining = getRemaining(interaction.guild.id);
            const body =
                summary.length > 1800 ? summary.slice(0, 1800) + "…" : summary;

            await interaction.editReply(
                `🧠 **Channel summary**\n\n${body}\n\n_AI requests left today: **${remaining}/${DAILY_LIMIT}**_`
            );
        } catch (error) {
            return replyAiError(interaction, error, interaction.guild?.id);
        }
    }
};
