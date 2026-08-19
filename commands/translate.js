const { SlashCommandBuilder } = require("discord.js");
const {
    translateText,
    getSupportedLanguageHint
} = require("../utils/translator.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("translate")
        .setDescription("Translate text into another language (does not use AI quota)")
        .addStringOption(option =>
            option
                .setName("text")
                .setDescription("Text to translate")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("language")
                .setDescription("Target language name or code (e.g. spanish, fr, ja)")
                .setRequired(true)
        ),

    async execute(interaction) {
        const text = interaction.options.getString("text");
        const language = interaction.options.getString("language");

        await interaction.deferReply();

        try {
            const result = await translateText(text, language);

            if (!result?.text) {
                return interaction.editReply("❌ I couldn't translate that.");
            }

            const body =
                result.text.length > 1900
                    ? result.text.slice(0, 1900) + "…"
                    : result.text;

            await interaction.editReply(
                `🌍 **Translation** → \`${result.to}\`\n\n${body}`
            );
        } catch (error) {
            console.error("Translation error:", error);

            if (error.code === "TRANSLATE_UNSUPPORTED_LANG") {
                return interaction.editReply(
                    `❌ ${error.message}\n${getSupportedLanguageHint()}`
                );
            }

            if (
                error.code === "TRANSLATE_HTTP" ||
                error.code === "TRANSLATE_INVALID" ||
                error.code === "TRANSLATE_EMPTY"
            ) {
                return interaction.editReply(
                    "❌ Translation service is unavailable or does not support that language pair. Try another language code (e.g. `en`, `es`, `fr`)."
                );
            }

            await interaction.editReply(
                "❌ I couldn't translate that right now. Please try again later."
            );
        }
    }
};
