const { loadDatabase, saveDatabase } = require("../../database/database.js");

function list(guildId) {
    const db = loadDatabase();
    return db.automations?.[guildId] || [];
}

function save(guildId, rules) {
    const db = loadDatabase();
    if (!db.automations) db.automations = {};
    db.automations[guildId] = rules;
    saveDatabase(db);
}

function add(guildId, rule) {
    const rules = list(guildId);
    const id = `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
        id,
        enabled: true,
        trigger: String(rule.trigger || "").toLowerCase().trim(),
        match: rule.match === "contains" ? "contains" : "exact",
        action: rule.action || "reply",
        response: String(rule.response || "").slice(0, 1500),
        emoji: rule.emoji || null,
        roleId: rule.roleId || null,
        channelId: rule.channelId || null,
        cooldownSec: Math.max(0, Number(rule.cooldownSec) || 5),
        createdAt: Date.now()
    };
    rules.push(entry);
    save(guildId, rules);
    return entry;
}

function remove(guildId, id) {
    const rules = list(guildId).filter((r) => r.id !== id);
    save(guildId, rules);
    return true;
}

function toggle(guildId, id, enabled) {
    const rules = list(guildId);
    const r = rules.find((x) => x.id === id);
    if (!r) return null;
    r.enabled = Boolean(enabled);
    save(guildId, rules);
    return r;
}

const lastFire = new Map();

function processMessage(message) {
    if (!message.guild || message.author?.bot || !message.content) return [];
    const rules = list(message.guild.id).filter((r) => r.enabled && r.trigger);
    if (!rules.length) return [];

    const content = message.content.trim();
    const lower = content.toLowerCase();
    const fired = [];

    for (const rule of rules) {
        if (rule.channelId && rule.channelId !== message.channel.id) continue;
        const ok =
            rule.match === "contains"
                ? lower.includes(rule.trigger)
                : lower === rule.trigger || lower.startsWith(rule.trigger + " ");
        if (!ok) continue;

        const key = `${message.guild.id}:${rule.id}:${message.author.id}`;
        const last = lastFire.get(key) || 0;
        if (Date.now() - last < (rule.cooldownSec || 5) * 1000) continue;
        lastFire.set(key, Date.now());
        fired.push(rule);
    }
    return fired;
}

module.exports = { list, add, remove, toggle, processMessage, save };
