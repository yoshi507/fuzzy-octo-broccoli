/**
 * Event-driven giveaway end scheduler.
 * No timers when there are zero active giveaways.
 */

const { listAllActive } = require("./store.js");

/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map();
let clientRef = null;

function keyOf(guildId, id) {
    return `${guildId}:${id}`;
}

function clearTimer(guildId, id) {
    const k = keyOf(guildId, id);
    const t = timers.get(k);
    if (t) {
        clearTimeout(t);
        timers.delete(k);
    }
}

function clearAll() {
    for (const t of timers.values()) {
        try {
            clearTimeout(t);
        } catch {
            /* ignore */
        }
    }
    timers.clear();
}

async function endOne(guildId, id) {
    clearTimer(guildId, id);
    if (!clientRef) return;
    try {
        const { finishGiveaway } = require("../../commands/giveaway.js");
        await finishGiveaway(clientRef, guildId, id);
    } catch (e) {
        console.error("[Giveaways] finish failed:", e?.message || e);
    }
}

function scheduleGiveaway(guildId, g) {
    if (!g || !g.id || g.status !== "active" || !g.endsAt) return;
    const k = keyOf(guildId, g.id);
    clearTimer(guildId, g.id);

    const delay = Math.max(0, Number(g.endsAt) - Date.now());
    const t = setTimeout(() => {
        timers.delete(k);
        endOne(guildId, g.id).catch(() => {});
    }, delay);
    if (typeof t.unref === "function") t.unref();
    timers.set(k, t);
}

function cancelGiveaway(guildId, id) {
    clearTimer(guildId, id);
}

function rescheduleAll(client) {
    if (client) clientRef = client;
    clearAll();
    if (!clientRef) return;

    let n = 0;
    try {
        const all = listAllActive();
        for (const g of all) {
            if (g.status === "active" && g.endsAt) {
                scheduleGiveaway(g.guildId, g);
                n++;
            }
        }
    } catch (e) {
        console.error("[Giveaways] reschedule:", e?.message || e);
    }
    if (n > 0) {
        console.log(`[Giveaways] scheduled ${n} active end timer(s)`);
    }
}

function initGiveawayScheduler(client) {
    clientRef = client;
    rescheduleAll(client);
}

module.exports = {
    initGiveawayScheduler,
    rescheduleAll,
    scheduleGiveaway,
    cancelGiveaway,
    clearAll
};
