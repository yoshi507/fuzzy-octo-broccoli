/**
 * Central OmniBot configuration.
 */
module.exports = {
    PREFIX: "!",

    BOT_INVOKE_NAMES: ["omni", "omnibot"],

    ALLOW_NATURAL_AI: true,

    /**
     * Official OmniBot Dashboard — same origin as the API (Wispbyte).
     * Override with DASHBOARD_URL if the public host/port changes.
     */
    DASHBOARD_URL:
        process.env.DASHBOARD_URL ||
        "http://78.154.103.20:13893/#/login",

    DASHBOARD_ORIGIN:
        process.env.DASHBOARD_ORIGIN ||
        "http://78.154.103.20:13893"
};
