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
const { getCatalogText } = require("../utils/ai/commandCatalog.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aihelp")
        .setDescription("Ask how Omni's commands and features work")
        .addStringOption(option =>
            option
                .setName("question")
                .setDescription("What do you want to know about Omni?")
                .setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString("question");
        await interaction.deferReply();

        if (!canUseAI(interaction.guild.id)) {
            return interaction.editReply(limitReachedMessage(interaction.guild.id));
        }

        try {
            const catalog = getCatalogText();

            const answer = await askAI(
                [
                    {
                        role: "system",
                        content:
                            "You are Omni's help assistant for a Discord bot called OmniBot.\n" +
                            "Answer ONLY using the real command list provided.\n" +
                            "If something is not in the list, say Omni does not have that feature yet.\n" +
                            "Never invent commands, permissions, or features.\n" +
                            "Be concise and practical.\n" +
                            "Mention that AI features share one server-wide daily limit of " +
                            DAILY_LIMIT +
                            " requests.\n\n" +
                            "Real OmniBot commands:\n" +
                            catalog
                    },
                    {
                        role: "user",
                        content: question
                    }
                ],
                {
                    guildId: interaction.guild.id,
                    temperature: 0.3,
                    maxTokens: 700
                }
            );

            if (!answer) {
                return interaction.editReply("❌ Omni couldn't answer that.");
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
