/**
 * Preloaded via: node -r ./utils/preloadDiag.js index.js
 * Ensures exit/signal diagnostics exist even if index.js is an older deploy.
 */
require("dotenv").config();
const { installProcessDiagnostics } = require("./processDiagnostics.js");
installProcessDiagnostics();
