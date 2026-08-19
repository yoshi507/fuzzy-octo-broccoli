const {
    SlashCommandBuilder
} = require("discord.js");

const {
    askOmni
} = require("../utils/ai/groq.js");

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

        const question =
            interaction.options.getString(
                "question"
            );

        await interaction.deferReply();

        try {

            const response =
                await askOmni(
                    question
                );

            if (!response) {
                return interaction.editReply(
                    "❌ Omni didn't return a response."
                );
            }

            const maxLength = 1900;

            if (response.length <= maxLength) {

                return interaction.editReply(
                    response
                );
            }

            const chunks = [];

            for (
                let i = 0;
                i < response.length;
                i += maxLength
            ) {
                chunks.push(
                    response.slice(
                        i,
                        i + maxLength
                    )
                );
            }

            await interaction.editReply(
                chunks[0]
            );

            for (
                let i = 1;
                i < chunks.length;
                i++
            ) {

                await interaction.followUp(
                    chunks[i]
                );
            }

        } catch (error) {

            console.error(
                "AI command error:",
                error
            );

            await interaction.editReply(
                "❌ I couldn't reach Omni's AI right now."
            );
        }
    }
};
