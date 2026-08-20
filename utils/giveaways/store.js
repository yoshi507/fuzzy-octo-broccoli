const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../data/giveaways.json");

function ensure() {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ guilds: {} }, null, 2));
    }
}

function load() {
    ensure();
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { guilds: {} };
    }
}

function save(data) {
    ensure();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getGuild(guildId) {
    const data = load();
    if (!data.guilds[guildId]) data.guilds[guildId] = { settings: { enabled: true }, active: {}, history: [] };
    return data.guilds[guildId];
}

function getSettings(guildId) {
    return getGuild(guildId).settings || { enabled: true };
}

function setSettings(guildId, patch) {
    const data = load();
    if (!data.guilds[guildId]) data.guilds[guildId] = { settings: { enabled: true }, active: {}, history: [] };
    data.guilds[guildId].settings = { ...data.guilds[guildId].settings, ...patch };
    save(data);
    return data.guilds[guildId].settings;
}

function createGiveaway(guildId, g) {
    const data = load();
    if (!data.guilds[guildId]) data.guilds[guildId] = { settings: { enabled: true }, active: {}, history: [] };
    data.guilds[guildId].active[g.id] = g;
    save(data);
    return g;
}

function getGiveaway(guildId, id) {
    return getGuild(guildId).active?.[id] || null;
}

function updateGiveaway(guildId, id, patch) {
    const data = load();
    const g = data.guilds[guildId]?.active?.[id];
    if (!g) return null;
    Object.assign(g, patch);
    data.guilds[guildId].active[id] = g;
    save(data);
    return g;
}

function endGiveaway(guildId, id) {
    const data = load();
    const g = data.guilds[guildId]?.active?.[id];
    if (!g) return null;
    delete data.guilds[guildId].active[id];
    if (!data.guilds[guildId].history) data.guilds[guildId].history = [];
    data.guilds[guildId].history.unshift(g);
    data.guilds[guildId].history = data.guilds[guildId].history.slice(0, 50);
    save(data);
    return g;
}

function listActive(guildId) {
    return Object.values(getGuild(guildId).active || {});
}

function listAllActive() {
    const data = load();
    const out = [];
    for (const [guildId, g] of Object.entries(data.guilds || {})) {
        for (const gw of Object.values(g.active || {})) {
            out.push({ ...gw, guildId });
        }
    }
    return out;
}

function addEntry(guildId, id, userId) {
    const g = getGiveaway(guildId, id);
    if (!g || g.status !== "active") return { ok: false, reason: "not_active" };
    if (!Array.isArray(g.entries)) g.entries = [];
    if (g.entries.includes(userId)) return { ok: false, reason: "duplicate" };
    g.entries.push(userId);
    updateGiveaway(guildId, id, { entries: g.entries });
    return { ok: true, count: g.entries.length };
}

module.exports = {
    getSettings,
    setSettings,
    createGiveaway,
    getGiveaway,
    updateGiveaway,
    endGiveaway,
    listActive,
    listAllActive,
    addEntry
};
