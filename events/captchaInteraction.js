const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require("discord.js");
const { verifyChallenge, getConfig } = require("../utils/captcha/store.js");

module.exports = {
    name: "interactionCreate",
    async execute(interaction) {
        try {
            if (interaction.isButton() && interaction.customId.startsWith("captcha_solve:")) {
                const token = interaction.customId.slice("captcha_solve:".length);
                const modal = new ModalBuilder()
                    .setCustomId(`captcha_modal:${token}`)
                    .setTitle("Verification");
                const input = new TextInputBuilder()
                    .setCustomId("answer")
                    .setLabel("Solve the math question")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(8);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
                return;
            }

            if (interaction.isModalSubmit() && interaction.customId.startsWith("captcha_modal:")) {
                const token = interaction.customId.slice("captcha_modal:".length);
                const guess = interaction.fields.getTextInputValue("answer");
                const result = verifyChallenge(token, guess);
                if (!result.ok) {
                    const msg =
                        result.reason === "expired"
                            ? "❌ That captcha expired. Rejoin or ask staff."
                            : result.reason === "wrong"
                              ? "❌ Incorrect answer. Try again."
                              : "❌ Invalid or expired captcha.";
                    return interaction.reply({ content: msg, ephemeral: true });
                }

                const cfg = getConfig(result.pending.guildId);
                const guild =
                    interaction.guild ||
                    (await interaction.client.guilds.fetch(result.pending.guildId).catch(() => null));
                if (!guild) {
                    return interaction.reply({ content: "✅ Verified (guild missing).", ephemeral: true });
                }
                const member =
                    guild.members.cache.get(result.pending.userId) ||
                    (await guild.members.fetch(result.pending.userId).catch(() => null));
                if (member) {
                    if (cfg.roleId) {
                        await member.roles.add(cfg.roleId).catch((e) =>
                            console.warn("[Captcha] role add:", e?.message || e)
                        );
                    }
                    if (cfg.unverifiedRoleId) {
                        await member.roles.remove(cfg.unverifiedRoleId).catch(() => {});
                    }
                }
                return interaction.reply({ content: "✅ Verified! Welcome.", ephemeral: true });
            }
        } catch (e) {
            console.error("[Captcha] interaction:", e?.message || e);
        }
    }
};
