require("dotenv").config();
try {
    const { getCloudflareStatus } = require("./utils/ai/cloudflareImage.js");
    const cf = getCloudflareStatus();
    const groqKey = Boolean(
        process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ_TOKEN
    );
    console.log(
        `[Startup] image provider: cloudflare=${cf.configured ? "ready" : "not-configured"}` +
            ` (accountId=${cf.hasAccountId ? "set" : "missing"}, token=${cf.hasToken ? "set" : "missing"})`
    );
    console.log(`[Startup] groq=${groqKey ? "ready" : "not-configured"}`);
} catch (e) {
    console.log("[Startup] image provider status unavailable:", e?.message || e);
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
