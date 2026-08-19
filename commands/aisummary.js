const {
    SlashCommandBuilder
} = require("discord.js");

const {
    askAI
} = require("../utils/ai/groq.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aisummary")
        .setDescription(
            "Get an AI summary of recent channel activity"
        ),

    async execute(interaction) {

        await interaction.deferReply();

        try {

            const messages =
                await interaction.channel.messages.fetch({
                    limit: 50
                });

            const sorted =
                [...messages.values()]
                    .sort(
                        (a, b) =>
                            a.createdTimestamp -
                            b.createdTimestamp
                    );

            const usable =
                sorted.filter(
                    message =>
                        !message.author.bot &&
                        message.content.trim().length > 0
                );

            if (usable.length === 0) {

                return interaction.editReply(
                    "📭 There aren't enough recent messages to summarise."
                );
            }

            const transcript =
                usable
                    .map(
                        message =>
                            `${message.author.username}: ${message.content}`
                    )
                    .join("\n");

            const prompt = `
Summarise the recent Discord conversation below for someone who has just joined the channel.

Rules:
- Explain the main topics being discussed.
- Mention important decisions, events or information.
- Do not invent anything.
- Ignore greetings and meaningless messages.
- Do not quote long messages.
- Keep it concise and easy to read.
- Use bullet points.
- End with a short sentence explaining what people are currently talking about.

Conversation:

${transcript}
`;

            const summary = await askAI(
    [
        {
            role: "system",
            content:
                "You summarise Discord conversations accurately and concisely."
        },
        {
            role: "user",
            content: prompt
        }
    ],
    {
        guildId: interaction.guild.id,
        temperature: 0.3,
        maxTokens: 800
    }
);

            if (!summary) {

                return interaction.editReply(
                    "❌ I couldn't create a summary."
                );
            }

            await interaction.editReply(
                `🧠 **While you were away...**\n\n${summary}`
            );

        } catch (error) {

            console.error(
                "AI Summary error:",
                error
            );

            await interaction.editReply(
                "❌ I couldn't summarise this channel."
            );
        }
    }
};
