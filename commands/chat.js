const {
    SlashCommandBuilder
} = require("discord.js");

const {
    askAI
} = require("../utils/ai/groq.js");

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

        try {
            const history = getConversation(
                interaction.guild.id,
                interaction.user.id
            );

            const messages = [
                {
                    role: "system",
                    content: `You are Omni, a chill, friendly and helpful Discord bot.

Personality:
- Chill and natural
- Friendly
- Can joke around when appropriate
- Helpful without being overly formal
- Keep normal responses reasonably concise
- Remember the conversation context provided to you
- Never claim to be human

You are talking to a user in a Discord server.`
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

            const maxLength = 1900;

            if (response.length <= maxLength) {
                return interaction.editReply(response);
            }

            await interaction.editReply(response.slice(0, maxLength));

            for (let i = maxLength; i < response.length; i += maxLength) {
                await interaction.followUp(
                    response.slice(i, i + maxLength)
                );
            }
        } catch (error) {
            if (error.code === "AI_DAILY_LIMIT") {
                return interaction.editReply(
                    "🚫 **Daily AI limit reached.**\n\n" +
                    "This server has used all 20 AI requests for today. " +
                    "The limit resets tomorrow."
                );
            }

            console.error("Chat command error:", error);

            await interaction.editReply(
                "❌ I couldn't talk to the AI right now."
            );
        }
    }
};
