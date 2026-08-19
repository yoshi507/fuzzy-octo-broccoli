const fs = require("fs");
const path = require("path");

const dataDirectory = path.join(__dirname, "../../data");
const settingsFile = path.join(dataDirectory, "ai-security.json");

function ensureStorage() {
    if (!fs.existsSync(dataDirectory)) {
        fs.mkdirSync(dataDirectory, {
            recursive: true
        });
    }

    if (!fs.existsSync(settingsFile)) {
        fs.writeFileSync(settingsFile, "{}", "utf8");
    }
}

function loadSecurity() {
    ensureStorage();

    try {
        return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch {
        return {};
    }
}

function saveSecurity(data) {
    ensureStorage();

    fs.writeFileSync(
        settingsFile,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

function defaultGuildSecurity() {
    return {
        enabled: false,
        mode: "monitor", // monitor | alert | lockdown
        joins: [],
        actions: [],
        incidents: [],
        antiNuke: {
            windowMs: 30000,
            thresholds: {
                channelDelete: 3,
                roleDelete: 3,
                channelCreate: 5,
                roleCreate: 5,
                massDelete: 5
            },
            autoTimeoutExecutor: false,
            autoTimeoutMinutes: 10,
            ignoreBot: true,
            ignoreOwner: true,
            alertCooldownMs: 45000
        }
    };
}

function getGuildSecurity(guildId) {
    const data = loadSecurity();
    const existing = data[guildId];

    if (!existing) {
        return defaultGuildSecurity();
    }

    // Merge defaults so older data still works
    const defaults = defaultGuildSecurity();
    return {
        ...defaults,
        ...existing,
        antiNuke: {
            ...defaults.antiNuke,
            ...(existing.antiNuke || {}),
            thresholds: {
                ...defaults.antiNuke.thresholds,
                ...((existing.antiNuke && existing.antiNuke.thresholds) || {})
            }
        },
        incidents: Array.isArray(existing.incidents) ? existing.incidents : [],
        joins: Array.isArray(existing.joins) ? existing.joins : [],
        actions: Array.isArray(existing.actions) ? existing.actions : []
    };
}

function setGuildSecurity(guildId, settings) {
    const data = loadSecurity();
    data[guildId] = settings;
    saveSecurity(data);
}

function addIncident(guildId, incident) {
    const data = loadSecurity();

    if (!data[guildId]) {
        data[guildId] = defaultGuildSecurity();
    }

    if (!Array.isArray(data[guildId].incidents)) {
        data[guildId].incidents = [];
    }

    data[guildId].incidents.push({
        ...incident,
        timestamp: Date.now()
    });

    data[guildId].incidents = data[guildId].incidents.slice(-50);

    saveSecurity(data);
}

function recordJoin(guildId) {
    const data = loadSecurity();

    if (!data[guildId]) {
        data[guildId] = defaultGuildSecurity();
    }

    if (!Array.isArray(data[guildId].joins)) {
        data[guildId].joins = [];
    }

    const now = Date.now();

    data[guildId].joins = data[guildId].joins.filter(
        timestamp => now - timestamp < 60000
    );

    data[guildId].joins.push(now);

    saveSecurity(data);

    return data[guildId].joins.length;
}

module.exports = {
    getGuildSecurity,
    setGuildSecurity,
    addIncident,
    recordJoin,
    defaultGuildSecurity
};
