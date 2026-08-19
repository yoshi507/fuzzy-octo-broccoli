/**
 * Central OmniBot configuration.
 */
module.exports = {
    PREFIX: "!",

    BOT_INVOKE_NAMES: ["omni", "omnibot"],

    ALLOW_NATURAL_AI: true,

    /**
     * Official OmniBot Dashboard (GitHub Pages).
     */
    DASHBOARD_URL:
        process.env.DASHBOARD_URL ||
        "https://yoshi507.github.io/Omnibot-dashboard/#/login",

    DASHBOARD_ORIGIN:
        process.env.DASHBOARD_ORIGIN ||
        "https://yoshi507.github.io"
};
