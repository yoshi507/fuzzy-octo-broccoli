const { loadDatabase, saveDatabase } = require("../../database/database.js");

function getWaiting() {
    const db = loadDatabase();
    return db.userphoneWaiting || null;
}

function setWaiting(entry) {
    const db = loadDatabase();
    db.userphoneWaiting = entry;
    saveDatabase(db);
}

function clearWaiting() {
    const db = loadDatabase();
    db.userphoneWaiting = null;
    saveDatabase(db);
}

function getSession(channelId) {
    const db = loadDatabase();
    return db.userphoneSessions?.[channelId] || null;
}

function createSession(a, b) {
    const db = loadDatabase();
    if (!db.userphoneSessions) db.userphoneSessions = {};
    const sessionId = `up_${Date.now().toString(36)}`;
    const session = {
        id: sessionId,
        a: { guildId: a.guildId, channelId: a.channelId, userId: a.userId },
        b: { guildId: b.guildId, channelId: b.channelId, userId: b.userId },
        createdAt: Date.now()
    };
    db.userphoneSessions[a.channelId] = session;
    db.userphoneSessions[b.channelId] = session;
    db.userphoneWaiting = null;
    saveDatabase(db);
    return session;
}

function endSession(channelId) {
    const db = loadDatabase();
    const s = db.userphoneSessions?.[channelId];
    if (!s) return null;
    delete db.userphoneSessions[s.a.channelId];
    delete db.userphoneSessions[s.b.channelId];
    saveDatabase(db);
    return s;
}

function partnerChannel(session, channelId) {
    if (!session) return null;
    if (session.a.channelId === channelId) return session.b;
    if (session.b.channelId === channelId) return session.a;
    return null;
}

module.exports = {
    getWaiting,
    setWaiting,
    clearWaiting,
    getSession,
    createSession,
    endSession,
    partnerChannel
};
