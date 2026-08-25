const fs = require("fs");

const databaseFile = "./database/omnibot.json";

if (!fs.existsSync("./database")) {
    fs.mkdirSync("./database", { recursive: true });
}

if (!fs.existsSync(databaseFile)) {
    fs.writeFileSync(databaseFile, JSON.stringify({ warnings: [] }));
}

/** In-memory cache — avoids re-reading disk on every message event. */
let cache = null;

function loadDatabase() {
    if (cache) return cache;
    try {
        cache = JSON.parse(fs.readFileSync(databaseFile, "utf8"));
    } catch {
        cache = { warnings: [] };
    }
    return cache;
}

function saveDatabase(data) {
    cache = data || cache || { warnings: [] };
    try {
        // Compact JSON — less disk than pretty-print
        fs.writeFileSync(databaseFile, JSON.stringify(cache));
    } catch (err) {
        if (err && (err.code === "ENOSPC" || /no space left/i.test(String(err.message || "")))) {
            console.error(
                "[Database] ENOSPC: disk full — cannot save. Free space on the host and restart."
            );
            return;
        }
        console.error("[Database] save failed:", err?.message || err);
    }
}

function invalidateDatabaseCache() {
    cache = null;
}

module.exports = {
    loadDatabase,
    saveDatabase,
    invalidateDatabaseCache
};
