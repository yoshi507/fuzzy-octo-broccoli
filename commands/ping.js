const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check if OmniBot is online"),

    async execute(interaction) {
        await interaction.reply(`🏓 Pong! Latency: ${interaction.client.ws.ping}ms`);
    }
};
