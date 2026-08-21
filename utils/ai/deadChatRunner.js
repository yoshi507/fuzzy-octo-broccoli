/**
 * Dead Chat Reviver — event-driven.
 * No continuous scanning of every channel.
 * Wakes only when a revival may be due.
 */
const { pickMessage } = require("./deadChatMessages.js");
const {
    listEnabledChannels,
    getSettings,
    setSettings
} = require("./deadChat.js");

const MIN_GAP_AFTER_REVIVAL_MS = 5 * 60 * 1000;
const MAX_WAKE_MS = 30 * 60 * 1000;
const MIN_WAKE_MS = 15 * 1000;

let wakeTimer = null;
let clientRef = null;
let recentMessages = new Map();
let started = false;

function remember(channelId, text) {
    const list = recentMessages.get(channelId) || [];
    list.push(text);
    while (list.length > 8) list.shift();
    recentMessages.set(channelId, list);
}

function clearWake() {
    if (wakeTimer) {
        clearTimeout(wakeTimer);
        wakeTimer = null;
    }
}

function computeNextDueMs() {
    const channels = listEnabledChannels();
    if (!channels.length) return null;

    const now = Date.now();
    let earliest = Infinity;

    for (const entry of channels) {
        const minutes = Math.max(5, Math.min(1440, entry.minutes || 30));
        const idleMs = minutes * 60 * 1000;
        const lastActivity = entry.lastActivity || now;
        let due = lastActivity + idleMs;

        if (entry.lastRevival) {
            const revivalGate =
                entry.lastRevival + Math.max(idleMs, MIN_GAP_AFTER_REVIVAL_MS);
            if (due < revivalGate) due = revivalGate;
        }

        if (due < earliest) earliest = due;
    }

    if (!Number.isFinite(earliest)) return null;
    return Math.max(MIN_WAKE_MS, Math.min(MAX_WAKE_MS, earliest - now));
}

function scheduleWake() {
    clearWake();
    if (!clientRef?.isReady?.()) return;

    const channels = listEnabledChannels();
    if (!channels.length) return;

    const delay = computeNextDueMs();
    if (delay == null) return;

    wakeTimer = setTimeout(() => {
        wakeTimer = null;
        tick(clientRef)
            .catch((e) => console.error("[DeadChat] tick:", e?.message || e))
            .finally(() => scheduleWake());
    }, delay);

    if (typeof wakeTimer.unref === "function") wakeTimer.unref();
}

async function reviveChannel(client, entry) {
    const now = Date.now();
    const minutes = Math.max(5, Math.min(1440, entry.minutes || 30));
    const idleMs = minutes * 60 * 1000;

    const lastActivity = entry.lastActivity || 0;
    if (!lastActivity) {
        const cur = getSettings(entry.channelId) || {};
        setSettings(entry.channelId, {
            ...cur,
            enabled: true,
            minutes,
            lastActivity: now,
            lastRevival: cur.lastRevival || 0,
            guildId: entry.guildId || cur.guildId || null
        });
        return;
    }

    if (now - lastActivity < idleMs) return;
    if (
        entry.lastRevival &&
        now - entry.lastRevival < Math.max(idleMs, MIN_GAP_AFTER_REVIVAL_MS)
    ) {
        return;
    }

    const ch = await client.channels.fetch(entry.channelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return;

    const exclude = recentMessages.get(entry.channelId) || [];
    const text = pickMessage(exclude);
    if (!text) return;

    await ch.send({ content: text });
    remember(entry.channelId, text);

    const cur = getSettings(entry.channelId) || {};
    setSettings(entry.channelId, {
        ...cur,
        enabled: true,
        minutes,
        lastActivity: now,
        lastRevival: now,
        guildId: entry.guildId || ch.guildId || cur.guildId || null
    });
}

async function tick(client) {
    if (!client?.isReady?.()) return;
    const channels = listEnabledChannels();
    if (!channels.length) return;

    const now = Date.now();
    for (const entry of channels) {
        try {
            const minutes = Math.max(5, Math.min(1440, entry.minutes || 30));
            const idleMs = minutes * 60 * 1000;
            if (!entry.lastActivity) {
                await reviveChannel(client, entry);
                continue;
            }
            if (now - entry.lastActivity < idleMs) continue;
            if (
                entry.lastRevival &&
                now - entry.lastRevival < Math.max(idleMs, MIN_GAP_AFTER_REVIVAL_MS)
            ) {
                continue;
            }
            await reviveChannel(client, entry);
        } catch (err) {
            console.error(
                "[DeadChat] channel failed",
                entry.channelId,
                err?.message || err
            );
        }
    }
}

function startDeadChatRunner(client) {
    clientRef = client;
    if (started) {
        scheduleWake();
        return;
    }
    started = true;
    scheduleWake();
    console.log("[DeadChat] event-driven reviver armed (idle until due)");
}

function notifyDeadChatActivity() {
    scheduleWake();
}

function notifyDeadChatConfigChanged() {
    scheduleWake();
}

module.exports = {
    startDeadChatRunner,
    tick,
    notifyDeadChatActivity,
    notifyDeadChatConfigChanged,
    scheduleWake
};
