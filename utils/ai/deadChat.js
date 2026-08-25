const fs = require("fs");
const path = require("path");
const { safeMkdir, safeWriteFile, isDiskError } = require("../safeFs.js");

const dataDirectory = path.join(__dirname, "../../data");
const settingsFile = path.join(dataDirectory, "dead-chat-settings.json");

let memCache = null;
let saveTimer = null;
let dirty = false;

function ensureStorage() {
    try {
        safeMkdir(dataDirectory);
        if (!fs.existsSync(settingsFile)) safeWriteFile(settingsFile, "{}");
        return true;
    } catch (err) {
        console.error("[DeadChat] ensureStorage:", err?.message || err);
        return false;
    }
}

function loadSettings() {
    if (memCache) return memCache;
    ensureStorage();
    try {
        memCache = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    } catch {
        memCache = {};
    }
    return memCache;
}

function flushSettings() {
    if (!dirty || !memCache) return;
    ensureStorage();
    try {
        if (safeWriteFile(settingsFile, JSON.stringify(memCache))) {
            dirty = false;
        }
    } catch (e) {
        console.error("[DeadChat] save failed:", e?.message || e);
    }
}

function scheduleSave() {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        flushSettings();
    }, 2000);
    if (typeof saveTimer.unref === "function") saveTimer.unref();
}

function saveSettings(settings) {
    memCache = settings;
    dirty = true;
    flushSettings();
}

function getSettings(channelId) {
    const settings = loadSettings();
    return settings[channelId] || null;
}

function setSettings(channelId, settings) {
    const all = loadSettings();
    all[channelId] = settings;
    scheduleSave();
    try {
        const { notifyDeadChatConfigChanged } = require("./deadChatRunner.js");
        if (typeof notifyDeadChatConfigChanged === "function") {
            notifyDeadChatConfigChanged();
        }
    } catch {
        /* runner may not be loaded yet */
    }
}

function disable(channelId) {
    const all = loadSettings();
    delete all[channelId];
    scheduleSave();
    try {
        const { notifyDeadChatConfigChanged } = require("./deadChatRunner.js");
        if (typeof notifyDeadChatConfigChanged === "function") {
            notifyDeadChatConfigChanged();
        }
    } catch {
        /* ignore */
    }
}

function addTopic(channelId, topic) {
    const all = loadSettings();
    if (!all[channelId]) all[channelId] = {};
    if (!Array.isArray(all[channelId].topics)) all[channelId].topics = [];
    all[channelId].topics.push(topic);
    if (all[channelId].topics.length > 25) {
        all[channelId].topics = all[channelId].topics.slice(-25);
    }
    scheduleSave();
}

function getTopics(channelId) {
    const settings = getSettings(channelId);
    return settings?.topics || [];
}

function listEnabledChannels() {
    const all = loadSettings();
    const out = [];
    for (const [channelId, settings] of Object.entries(all || {})) {
        if (settings && settings.enabled) {
            out.push({
                channelId,
                minutes: Number(settings.minutes) > 0 ? Number(settings.minutes) : 30,
                lastRevival: Number(settings.lastRevival) || 0,
                lastActivity: Number(settings.lastActivity) || 0,
                guildId: settings.guildId || null
            });
        }
    }
    return out;
}

function touchActivity(channelId) {
    const all = loadSettings();
    if (!all[channelId] || !all[channelId].enabled) return false;
    all[channelId].lastActivity = Date.now();
    scheduleSave();
    try {
        const { notifyDeadChatActivity } = require("./deadChatRunner.js");
        if (typeof notifyDeadChatActivity === "function") {
            notifyDeadChatActivity(channelId);
        }
    } catch {
        /* ignore */
    }
    return true;
}

module.exports = {
    getSettings,
    setSettings,
    disable,
    addTopic,
    getTopics,
    listEnabledChannels,
    touchActivity,
    flushSettings
};
