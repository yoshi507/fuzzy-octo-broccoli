/**
 * Central OmniBot configuration.
 */
module.exports = {
    PREFIX: "!",

    BOT_INVOKE_NAMES: ["omni", "omnibot"],

    ALLOW_NATURAL_AI: true,

    /**
     * Official OmniBot Dashboard (public site).
     * Override with DASHBOARD_URL only if the public host changes.
     */
    DASHBOARD_URL:
        process.env.DASHBOARD_URL ||
        "https://omnibot.wisp.uno",

    DASHBOARD_ORIGIN:
        process.env.DASHBOARD_ORIGIN ||
        "https://omnibot.wisp.uno"
};
