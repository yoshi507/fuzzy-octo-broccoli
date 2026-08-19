const { SlashCommandBuilder } = require("discord.js");
const { transfer } = require("../utils/economy.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pay")
        .setDescription("Pay OmniCoins to another member")
        .addUserOption(o =>
            o.setName("user").setDescription("Who to pay").setRequired(true)
        )
        .addStringOption(o =>
            o
                .setName("amount")
                .setDescription("Amount to send (number)")
                .setRequired(true)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser("user");
        if (target.bot) {
            return interaction.reply({
                content: "❌ You can't pay bots.",
                ephemeral: true
            });
        }

        const raw = interaction.options.getString("amount");
        const amount = Math.floor(Number(String(raw).replace(/,/g, "")));
        if (!Number.isFinite(amount) || amount < 1) {
            return interaction.reply({
                content: "❌ Enter a valid positive amount.",
                ephemeral: true
            });
        }

        const result = transfer(
            interaction.guild.id,
            interaction.user.id,
            target.id,
            amount
        );

        if (!result.ok) {
            if (result.reason === "self") {
                return interaction.reply({
                    content: "❌ You can't pay yourself.",
                    ephemeral: true
                });
            }
            if (result.reason === "insufficient") {
                return interaction.reply({
                    content: `❌ Not enough coins. You have **${result.coins}**.`,
                    ephemeral: true
                });
            }
            return interaction.reply({
                content: "❌ Payment failed.",
                ephemeral: true
            });
        }

        await interaction.reply(
            `💸 ${interaction.user} paid **${result.amount.toLocaleString()}** OmniCoins to ${target}.\n` +
                `Your balance: **${result.fromCoins.toLocaleString()}**`
        );
    }
};
