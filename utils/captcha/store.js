const { loadDatabase, saveDatabase } = require("../../database/database.js");

function getConfig(guildId) {
    const db = loadDatabase();
    return {
        enabled: false,
        channelId: null,
        roleId: null,
        unverifiedRoleId: null,
        timeoutMinutes: 10,
        ...(db.captcha?.[guildId] || {})
    };
}

function setConfig(guildId, patch) {
    const db = loadDatabase();
    if (!db.captcha) db.captcha = {};
    db.captcha[guildId] = { ...getConfig(guildId), ...patch };
    saveDatabase(db);
    return db.captcha[guildId];
}

function createChallenge(guildId, userId) {
    const a = 2 + Math.floor(Math.random() * 10);
    const b = 1 + Math.floor(Math.random() * 10);
    const answer = a + b;
    const db = loadDatabase();
    if (!db.captchaPending) db.captchaPending = {};
    const token = `${guildId}:${userId}:${Date.now().toString(36)}`;
    db.captchaPending[token] = {
        guildId,
        userId,
        answer,
        prompt: `What is ${a} + ${b}?`,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000
    };
    saveDatabase(db);
    return { token, prompt: `What is ${a} + ${b}?`, answer };
}

function verifyChallenge(token, guess) {
    const db = loadDatabase();
    const pending = db.captchaPending?.[token];
    if (!pending) return { ok: false, reason: "invalid" };
    if (Date.now() > pending.expiresAt) {
        delete db.captchaPending[token];
        saveDatabase(db);
        return { ok: false, reason: "expired" };
    }
    const n = Number(String(guess).trim());
    if (n !== pending.answer) return { ok: false, reason: "wrong", pending };
    delete db.captchaPending[token];
    saveDatabase(db);
    return { ok: true, pending };
}

function cleanupExpired() {
    const db = loadDatabase();
    if (!db.captchaPending) return;
    const now = Date.now();
    let changed = false;
    for (const [k, v] of Object.entries(db.captchaPending)) {
        if (v.expiresAt < now) {
            delete db.captchaPending[k];
            changed = true;
        }
    }
    if (changed) saveDatabase(db);
}

module.exports = { getConfig, setConfig, createChallenge, verifyChallenge, cleanupExpired };
