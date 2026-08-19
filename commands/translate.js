const {
    SlashCommandBuilder
} = require("discord.js");

const {
    askAI
} = require("../utils/ai/groq.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("translate")
        .setDescription("Translate text into another language")
        .addStringOption(option =>
            option
                .setName("text")
                .setDescription("Text to translate")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("language")
                .setDescription("Language to translate into")
                .setRequired(true)
        ),

    async execute(interaction) {

        const text =
            interaction.options.getString("text");

        const language =
            interaction.options.getString("language");

        await interaction.deferReply();

        try {

            const translation =
    await askAI(
        [
            {
                role: "system",
                content:
                    "You are a professional translator. Translate accurately while preserving the original meaning, tone and formatting. Output ONLY the translation."
            },
            {
                role: "user",
                content:
                    `Translate the following text into ${language}:\n\n${text}`
            }
        ],
        {
            guildId: interaction.guild.id,
            temperature: 0.2,
            maxTokens: 1000
        }
    );
            if (!translation) {
                return interaction.editReply(
                    "❌ I couldn't translate that."
                );
            }

            await interaction.editReply(
                `🌍 **${language} translation:**\n\n${translation}`
            );

        } catch (error) {

            console.error(
                "Translation error:",
                error
            );

            await interaction.editReply(
                "❌ I couldn't translate that right now."
            );
        }
    }
};
