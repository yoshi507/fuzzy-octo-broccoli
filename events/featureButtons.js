module.exports = {
    name: "interactionCreate",
    once: false,
    async execute(interaction) {
        if (!interaction.isButton()) return;
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
