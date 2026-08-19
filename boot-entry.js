/**
 * Preferred process entry on Wispbyte / npm start.
 * Installs diagnostics, then loads the bot.
 */
require("./utils/preloadDiag.js");
require("./index.js");
