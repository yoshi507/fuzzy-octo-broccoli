module.exports = {
    name: "interactionCreate",
    once: false,

    async execute(interaction) {
        if (!interaction.isModalSubmit()) return;
        if (!interaction.customId.startsWith("appeal_modal:")) return;

        try {
            const appealCmd = interaction.client.commands.get("appeal");
            if (appealCmd?.handleModal) {
                await appealCmd.handleModal(interaction);
            }
        } catch (error) {
            console.error("Appeal modal error:", error?.message || error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "❌ Something went wrong with that form.",
                        ephemeral: true
                    });
                }
            } catch {}
        }
    }
};
