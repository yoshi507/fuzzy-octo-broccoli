const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getInventory, SHOP } = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("inventory")
        .setDescription("View your Omni shop items")
        .addUserOption(o =>
            o.setName("user").setDescription("Whose inventory").setRequired(false)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser("user") || interaction.user;
        const inv = getInventory(interaction.guild.id, target.id);
        const entries = Object.entries(inv).filter(([, n]) => n > 0);

        if (entries.length === 0) {
            return interaction.reply({
                content: `${target.username} has an empty inventory. Visit \`/shop\`!`,
                ephemeral: target.id === interaction.user.id
            });
        }

        const lines = entries.map(([id, count]) => {
            const item = SHOP[id];
            const name = item ? item.name : id;
            return `• **${name}** × ${count}`;
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${target.username}'s Inventory`)
            .setDescription(lines.join("\n"))
            .setColor(0x1abc9c);

        await interaction.reply({ embeds: [embed] });
    }
};
