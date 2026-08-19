const fs = require("fs");
const path = require("path");

const dataDirectory = path.join(__dirname, "../../data");
const limitFile = path.join(dataDirectory, "ai-limits.json");

const DAILY_LIMIT = 20;

function ensureStorage() {
    if (!fs.existsSync(dataDirectory)) {
        fs.mkdirSync(dataDirectory, { recursive: true });
    }
    if (!fs.existsSync(limitFile)) {
        fs.writeFileSync(limitFile, "{}", "utf8");
    }
}

function loadLimits() {
    ensureStorage();
    try {
        return JSON.parse(fs.readFileSync(limitFile, "utf8"));
    } catch {
        return {};
    }
}

function saveLimits(limits) {
    ensureStorage();
    fs.writeFileSync(limitFile, JSON.stringify(limits, null, 2), "utf8");
}

function getToday() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Next UTC midnight when the daily counter resets.
 */
function getResetAt() {
    const now = new Date();
    return new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            0,
            0,
            0,
            0
        )
    );
}

/**
 * Human-readable time until reset (e.g. "in about 3 hours and 12 minutes").
 */
function getResetDescription() {
    const ms = Math.max(0, getResetAt().getTime() - Date.now());
    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0 && minutes <= 1) {
        return "in about a minute";
    }
    if (hours <= 0) {
        return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
    }
    if (minutes === 0) {
        return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `in about ${hours} hour${hours === 1 ? "" : "s"} and ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function normalizeGuildEntry(limits, guildId) {
    const today = getToday();
    if (!limits[guildId] || limits[guildId].date !== today) {
        limits[guildId] = { date: today, count: 0 };
    }
    return limits[guildId];
}

function canUseAI(guildId) {
    if (!guildId) {
        return true;
    }
    const limits = loadLimits();
    const entry = normalizeGuildEntry(limits, guildId);
    return entry.count < DAILY_LIMIT;
}

function useAI(guildId) {
    if (!guildId) {
        return;
    }
    const limits = loadLimits();
    const entry = normalizeGuildEntry(limits, guildId);
    entry.count++;
    saveLimits(limits);
}

function getRemaining(guildId) {
    if (!guildId) {
        return DAILY_LIMIT;
    }
    const limits = loadLimits();
    const entry = normalizeGuildEntry(limits, guildId);
    return Math.max(0, DAILY_LIMIT - entry.count);
}

function getUsage(guildId) {
    if (!guildId) {
        return {
            used: 0,
            remaining: DAILY_LIMIT,
            limit: DAILY_LIMIT,
            resetAt: getResetAt(),
            resetDescription: getResetDescription()
        };
    }
    const remaining = getRemaining(guildId);
    return {
        used: DAILY_LIMIT - remaining,
        remaining,
        limit: DAILY_LIMIT,
        resetAt: getResetAt(),
        resetDescription: getResetDescription()
    };
}

module.exports = {
    DAILY_LIMIT,
    canUseAI,
    useAI,
    getRemaining,
    getUsage,
    getResetAt,
    getResetDescription,
    getToday
};
