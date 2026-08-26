console.log("[Startup] deployMarker=2026-08-26-feature-pack-v3-slim-deps");
try {
    require("dotenv").config();
} catch (e) {
    console.error(
        "[Startup] Missing dependency 'dotenv' (and likely node_modules). " +
            "Disk is full (ENOSPC) or npm install failed. " +
            "Delete /home/container/.npm and node_modules in File Manager, free space, then: npm install --omit=dev --no-audit --no-fund"
    );
    console.error(e?.message || e);
    process.exit(1);
}
try {
    const groqKey = Boolean(
        process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ_TOKEN
    );
    console.log(`[Startup] groq=${groqKey ? "ready" : "not-configured"}`);
    try {
        const { getHomeModeStatus } = require("./utils/ai/homeModeImage.js");
        const hm = getHomeModeStatus();
        console.log(
            `[Startup] image homemode=${hm.configured ? "ready" : "not-configured"}` +
                ` (url=${hm.hasUrl ? "set" : "missing"}, key=${hm.hasKey ? "set" : "missing"})`
        );
    } catch (_) {}
} catch (e) {
    console.log("[Startup] AI status unavailable:", e?.message || e);
}

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
});
process.on("exit", (code) => {
    console.log(`[process] exit code=${code}`);
});

// Full bot bootstrap (commands, events, API, Discord login)
require("./bootstrap.js");
