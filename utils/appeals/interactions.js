/**
 * Route appeal-related button and modal interactions.
 * Returns true if the interaction was handled.
 */
async function handleAppealInteraction(interaction) {
    if (interaction.isButton() &&
        (interaction.customId?.startsWith('appeal_accept:') ||
         interaction.customId?.startsWith('appeal_reject:'))) {
        const appealCmd = interaction.client.commands.get('appeal');
        if (appealCmd?.handleButton) {
            await appealCmd.handleButton(interaction);
        }
        return true;
    }

    if (interaction.isModalSubmit() &&
        interaction.customId?.startsWith('appeal_modal:')) {
        const appealCmd = interaction.client.commands.get('appeal');
        if (appealCmd?.handleModal) {
            await appealCmd.handleModal(interaction);
        }
        return true;
    }

    return false;
}

module.exports = { handleAppealInteraction };
