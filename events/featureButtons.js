module.exports = {
    name: "interactionCreate",
    once: false,
    async execute(interaction) {
        if (!interaction.isButton()) return;

        // Appeal Accept / Reject
        try {
            if (
                interaction.customId?.startsWith("appeal_accept:") ||
                interaction.customId?.startsWith("appeal_reject:")
            ) {
                const appealCmd = interaction.client.commands.get("appeal");
                if (appealCmd?.handleButton) {
                    await appealCmd.handleButton(interaction);
                    return;
                }
            }
        } catch (e) {
            console.error("Appeal button:", e?.message || e);
        }

        try {
            const { handleGiveawayButton } = require("../commands/giveaway.js");
            if (await handleGiveawayButton(interaction)) return;
        } catch (e) {
            console.error("Giveaway button:", e?.message || e);
        }
        try {
            const { handleReactionRoleButton } = require("../commands/reactionrole.js");
            if (await handleReactionRoleButton(interaction)) return;
        } catch (e) {
            console.error("Reaction role button:", e?.message || e);
        }
    }
};
