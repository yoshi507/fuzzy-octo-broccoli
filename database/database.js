const fs = require("fs");

const databaseFile = "./database/omnibot.json";

if (!fs.existsSync("./database")) {
    fs.mkdirSync("./database", { recursive: true });
}

if (!fs.existsSync(databaseFile)) {
    fs.writeFileSync(
        databaseFile,
        JSON.stringify(
            {
                warnings: []
            },
            null,
            2
        )
    );
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
    fs.writeFileSync(databaseFile, JSON.stringify(cache, null, 2));
}

function invalidateDatabaseCache() {
    cache = null;
}

module.exports = {
    loadDatabase,
    saveDatabase,
    invalidateDatabaseCache
};
