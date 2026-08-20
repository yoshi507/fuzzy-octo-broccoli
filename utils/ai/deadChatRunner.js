/**
 * Dead Chat Reviver runtime.
 * Posts a non-AI revival message when a configured channel is idle.
 */
const { pickMessage } = require("./deadChatMessages.js");
const {
    listEnabledChannels,
    getSettings,
    setSettings
} = require("./deadChat.js");

const TICK_MS = 60 * 1000;
const MIN_GAP_AFTER_REVIVAL_MS = 5 * 60 * 1000;

let timer = null;
let recentMessages = new Map();

function remember(channelId, text) {
    const list = recentMessages.get(channelId) || [];
    list.push(text);
    while (list.length > 8) list.shift();
    recentMessages.set(channelId, list);
}

async function tick(client) {
    if (!client?.isReady?.()) return;

    const channels = listEnabledChannels();
    const now = Date.now();

    for (const entry of channels) {
        try {
            const minutes = Math.max(5, Math.min(1440, entry.minutes || 30));
            const idleMs = minutes * 60 * 1000;
            const ch = await client.channels.fetch(entry.channelId).catch(() => null);
            if (!ch || !ch.isTextBased?.()) continue;

            let lastActivity = entry.lastActivity || 0;
            try {
                const fetched = await ch.messages.fetch({ limit: 1 });
                const last = fetched.first();
                if (last?.createdTimestamp) {
                    lastActivity = Math.max(lastActivity, last.createdTimestamp);
                }
            } catch {
                /* ignore */
            }

            if (!lastActivity) {
                const cur = getSettings(entry.channelId) || {};
                setSettings(entry.channelId, {
                    ...cur,
                    enabled: true,
                    minutes,
                    lastActivity: now,
                    lastRevival: cur.lastRevival || 0,
                    guildId: entry.guildId || ch.guildId
                });
                continue;
            }

            if (now - lastActivity < idleMs) continue;
            if (
                entry.lastRevival &&
                now - entry.lastRevival < Math.max(idleMs, MIN_GAP_AFTER_REVIVAL_MS)
            ) {
                continue;
            }

            const exclude = recentMessages.get(entry.channelId) || [];
            const text = pickMessage(exclude);
            if (!text) continue;

            await ch.send({ content: text });
            remember(entry.channelId, text);

            const cur = getSettings(entry.channelId) || {};
            setSettings(entry.channelId, {
                ...cur,
                enabled: true,
                minutes,
                lastActivity: now,
                lastRevival: now,
                guildId: entry.guildId || ch.guildId
            });
        } catch (err) {
            console.error(
                "[DeadChat] tick failed for",
                entry.channelId,
                err?.message || err
            );
        }
    }
}

function startDeadChatRunner(client) {
    if (timer) return;
    const run = () => {
        tick(client).catch((e) => console.error("[DeadChat] tick:", e?.message || e));
    };
    run();
    timer = setInterval(run, TICK_MS);
    if (typeof timer.unref === "function") timer.unref();
    console.log("[DeadChat] reviver timer started");
}

module.exports = { startDeadChatRunner, tick };
