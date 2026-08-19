/**
 * Loaded as a no-op event placeholder; modal handling is in index InteractionCreate.
 * Kept so deploy checklists include modal support documentation.
 */
module.exports = {
    name: "interactionCreate",
    once: false,
    async execute() {
        /* Modals are handled in index.js to avoid double-handling chat commands. */
    }
};
