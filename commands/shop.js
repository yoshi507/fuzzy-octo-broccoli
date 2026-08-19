const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { SHOP } = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shop")
        .setDescription("Browse the OmniCoin shop"),

    async execute(interaction) {
        const lines = Object.values(SHOP).map(
            item =>
                `**${item.name}** (\`${item.id}\`) — **${item.price}** coins\n_${item.description}_`
        );

        const embed = new EmbedBuilder()
            .setTitle("🛒 Omni Shop")
            .setDescription(lines.join("\n\n"))
            .setFooter({ text: "Buy with /buy item:<id>" })
            .setColor(0x9b59b6);

        await interaction.reply({ embeds: [embed] });
    }
};
