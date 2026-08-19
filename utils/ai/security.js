const fs = require("fs");
const path = require("path");

const dataDirectory =
    path.join(__dirname, "../../data");

const settingsFile =
    path.join(dataDirectory, "ai-security.json");

function ensureStorage() {

    if (!fs.existsSync(dataDirectory)) {
        fs.mkdirSync(dataDirectory, {
            recursive: true
        });
    }

    if (!fs.existsSync(settingsFile)) {
        fs.writeFileSync(
            settingsFile,
            "{}",
            "utf8"
        );
    }
}

function loadSecurity() {

    ensureStorage();

    try {
        return JSON.parse(
            fs.readFileSync(
                settingsFile,
                "utf8"
            )
        );
    } catch {
        return {};
    }
}

function saveSecurity(data) {

    ensureStorage();

    fs.writeFileSync(
        settingsFile,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );
}

function getGuildSecurity(guildId) {

    const data =
        loadSecurity();

    return data[guildId] || {
        enabled: false,
        mode: "monitor",
        joins: [],
        actions: [],
        incidents: []
    };
}

function setGuildSecurity(
    guildId,
    settings
) {

    const data =
        loadSecurity();

    data[guildId] =
        settings;

    saveSecurity(data);
}

function addIncident(
    guildId,
    incident
) {

    const data =
        loadSecurity();

    if (!data[guildId]) {

        data[guildId] = {
            enabled: false,
            mode: "monitor",
            joins: [],
            actions: [],
            incidents: []
        };
    }

    if (!Array.isArray(
        data[guildId].incidents
    )) {
        data[guildId].incidents = [];
    }

    data[guildId].incidents.push({
        ...incident,
        timestamp: Date.now()
    });

    data[guildId].incidents =
        data[guildId].incidents.slice(-50);

    saveSecurity(data);
}

function recordJoin(
    guildId
) {

    const data =
        loadSecurity();

    if (!data[guildId]) {

        data[guildId] = {
            enabled: false,
            mode: "monitor",
            joins: [],
            actions: [],
            incidents: []
        };
    }

    if (!Array.isArray(
        data[guildId].joins
    )) {
        data[guildId].joins = [];
    }

    const now =
        Date.now();

    data[guildId].joins =
        data[guildId].joins.filter(
            timestamp =>
                now - timestamp < 60000
        );

    data[guildId].joins.push(now);

    saveSecurity(data);

    return data[guildId].joins.length;
}

module.exports = {
    getGuildSecurity,
    setGuildSecurity,
    addIncident,
    recordJoin
};
