/**
 * Central OmniBot configuration for text / natural invocation.
 * Change PREFIX here to update the text-command prefix everywhere.
 */
module.exports = {
    /** Text-command prefix (e.g. "!" → !ping). */
    PREFIX: "!",

    /**
     * Case-insensitive names that invoke Omni when used at the start of a message.
     * Only matches as the first word (not mid-sentence).
     */
    BOT_INVOKE_NAMES: ["omni", "omnibot"],

    /**
     * If the first token is not a known command, treat the rest as an AI request
     * when the message was invoked via name or prefix.
     */
    ALLOW_NATURAL_AI: true
};
