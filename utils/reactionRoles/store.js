const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../data/reaction-roles.json");

function ensure() {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ guilds: {} }, null, 2));
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

function listConfigs(guildId) {
    const data = load();
    return data.guilds[guildId]?.configs || [];
}

function saveConfigs(guildId, configs) {
    const data = load();
    if (!data.guilds[guildId]) data.guilds[guildId] = { configs: [] };
    data.guilds[guildId].configs = configs;
    save(data);
    return configs;
}

function addConfig(guildId, cfg) {
    const list = listConfigs(guildId);
    list.push(cfg);
    return saveConfigs(guildId, list);
}

function removeConfig(guildId, configId) {
    const list = listConfigs(guildId).filter((c) => c.id !== configId);
    return saveConfigs(guildId, list);
}

function findByCustomId(customId) {
    const data = load();
    for (const [guildId, g] of Object.entries(data.guilds || {})) {
        for (const c of g.configs || []) {
            if (c.customId === customId) return { guildId, config: c };
        }
    }
    return null;
}

module.exports = {
    listConfigs,
    saveConfigs,
    addConfig,
    removeConfig,
    findByCustomId
};
