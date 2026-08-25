const { readGuildFeature, writeGuildFeature, getGuildNode } = require("./guildFeatureStore.js");
const { loadDatabase, saveDatabase } = require("../../database/database.js");

const DEFAULT_WORDS = [
    "fuck", "shit", "bitch", "asshole", "bastard", "dick", "cunt", "nigger", "nigga",
    "faggot", "retard", "whore", "slut"
];

function getConfig(guildId) {
    return readGuildFeature("swearJar", guildId, {
        enabled: false,
        fine: 5,
        words: DEFAULT_WORDS,
        totalCollected: 0,
        logChannelId: null
    });
}

function setConfig(guildId, patch) {
    return writeGuildFeature("swearJar", guildId, patch);
}

function normalizeWords(list) {
    return [...new Set((list || []).map((w) => String(w).toLowerCase().trim()).filter(Boolean))];
}

function findSwear(content, words) {
    const text = String(content || "").toLowerCase();
    if (!text) return null;
    for (const w of words) {
        if (!w) continue;
        const re = new RegExp(`(?:^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i");
        if (re.test(text)) return w;
    }
    return null;
}

function ensureEconomy(db, guildId, userId) {
    if (!db.economy) db.economy = {};
    if (!db.economy[guildId]) db.economy[guildId] = {};
    if (!db.economy[guildId][userId]) {
        db.economy[guildId][userId] = { balance: 0, bank: 0 };
    }
    return db.economy[guildId][userId];
}

function processMessage(message) {
    if (!message.guild || message.author?.bot) return null;
    const cfg = getConfig(message.guild.id);
    if (!cfg.enabled) return null;
    const words = normalizeWords(cfg.words?.length ? cfg.words : DEFAULT_WORDS);
    const word = findSwear(message.content, words);
    if (!word) return null;

    const fine = Math.max(0, Number(cfg.fine) || 0);
    const db = loadDatabase();
    const user = ensureEconomy(db, message.guild.id, message.author.id);
    const paid = Math.min(user.balance || 0, fine);
    user.balance = Math.max(0, (user.balance || 0) - fine);

    if (!db.swearJar) db.swearJar = {};
    if (!db.swearJar[message.guild.id]) {
        db.swearJar[message.guild.id] = { enabled: true, fine, words, totalCollected: 0 };
    }
    db.swearJar[message.guild.id].totalCollected =
        (db.swearJar[message.guild.id].totalCollected || 0) + paid;
    db.swearJar[message.guild.id].enabled = cfg.enabled;
    db.swearJar[message.guild.id].fine = fine;
    db.swearJar[message.guild.id].words = words;
    db.swearJar[message.guild.id].logChannelId = cfg.logChannelId || null;

    if (!db.swearJarLog) db.swearJarLog = {};
    if (!db.swearJarLog[message.guild.id]) db.swearJarLog[message.guild.id] = [];
    db.swearJarLog[message.guild.id].unshift({
        userId: message.author.id,
        word,
        fine: paid,
        at: Date.now()
    });
    db.swearJarLog[message.guild.id] = db.swearJarLog[message.guild.id].slice(0, 50);

    saveDatabase(db);
    return {
        hit: true,
        word,
        fine: paid,
        requestedFine: fine,
        newBalance: user.balance,
        total: db.swearJar[message.guild.id].totalCollected
    };
}

module.exports = { getConfig, setConfig, processMessage, DEFAULT_WORDS, normalizeWords };
