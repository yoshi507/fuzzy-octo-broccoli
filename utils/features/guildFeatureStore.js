/**
 * Simple per-guild feature config helpers backed by omnibot.json
 */
const { loadDatabase, saveDatabase } = require("../../database/database.js");

function getGuildNode(key, guildId) {
    const db = loadDatabase();
    if (!db[key]) db[key] = {};
    if (!db[key][guildId]) db[key][guildId] = {};
    return { db, node: db[key][guildId] };
}

function readGuildFeature(key, guildId, defaults = {}) {
    const db = loadDatabase();
    return { ...defaults, ...(db[key]?.[guildId] || {}) };
}

function writeGuildFeature(key, guildId, patch) {
    const { db, node } = getGuildNode(key, guildId);
    Object.assign(node, patch);
    saveDatabase(db);
    return node;
}

module.exports = { getGuildNode, readGuildFeature, writeGuildFeature };
