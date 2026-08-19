const {
    SlashCommandBuilder
} = require("discord.js");

const {
    clearConversation
} = require("../utils/ai/memory.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clearmemory")
        .setDescription(
            "Delete your conversation memory with Omni"
        ),

    async execute(interaction) {

        clearConversation(
            interaction.guild.id,
            interaction.user.id
        );

        await interaction.reply({
            content:
                "🧹 Your Omni conversation memory has been cleared.",
            ephemeral: true
        });
    }
};
