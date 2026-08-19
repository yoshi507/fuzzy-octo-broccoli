/**
 * Central OmniBot configuration for text / natural invocation.
 * Change PREFIX here to update the text-command prefix everywhere.
 */
module.exports = {
    /** Text-command prefix (e.g. "!" → !ping). */
    PREFIX: "!",

    /**
     * Case-insensitive names that invoke Omni when they appear
     * anywhere in a message as whole words (not only at the start).
     */
    BOT_INVOKE_NAMES: ["omni", "omnibot"],

    /**
     * If the text after the name is not a known command, treat it as an AI request.
     */
    ALLOW_NATURAL_AI: true,

    /**
     * Official OmniBot Dashboard URL (GitHub Pages).
     * Path is case-sensitive: capital O in OmniBot.
     * Override with DASHBOARD_URL env if needed.
     */
    DASHBOARD_URL:
        process.env.DASHBOARD_URL || "https://yoshi507.github.io/OmniBot/"
};
