const fs = require("fs");

const databaseFile = "./database/omnibot.json";

if (!fs.existsSync("./database")) {
    fs.mkdirSync("./database", { recursive: true });
}

if (!fs.existsSync(databaseFile)) {
    fs.writeFileSync(
        databaseFile,
        JSON.stringify({
            warnings: []
        }, null, 2)
    );
}

function loadDatabase() {
    return JSON.parse(fs.readFileSync(databaseFile, "utf8"));
}

function saveDatabase(data) {
    fs.writeFileSync(
        databaseFile,
        JSON.stringify(data, null, 2)
    );
}

module.exports = {
    loadDatabase,
    saveDatabase
};
