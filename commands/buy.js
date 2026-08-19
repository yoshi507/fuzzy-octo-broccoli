const { SlashCommandBuilder } = require("discord.js");
const { buyItem, SHOP } = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("buy")
        .setDescription("Buy an item from the Omni shop")
        .addStringOption(o =>
            o
                .setName("item")
                .setDescription("Item id from /shop")
                .setRequired(true)
                .addChoices(
                    ...Object.values(SHOP).map(item => ({
                        name: `${item.name} (${item.price})`,
                        value: item.id
                    }))
                )
        ),

    async execute(interaction) {
        const itemId = interaction.options.getString("item");
        const result = buyItem(interaction.guild.id, interaction.user.id, itemId);

        if (!result.ok) {
            if (result.reason === "insufficient") {
                return interaction.reply({
                    content: `❌ You need **${result.price}** coins but only have **${result.coins}**.`,
                    ephemeral: true
                });
            }
            return interaction.reply({
                content: "❌ Unknown item.",
                ephemeral: true
            });
        }

        await interaction.reply(
            `🛍️ You bought a **${result.item.name}** for **${result.item.price}** coins!\n` +
                `Owned: **${result.owned}** · Balance: **${result.coins.toLocaleString()}**`
        );
    }
};
