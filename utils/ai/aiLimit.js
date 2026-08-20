const fs = require("fs");
const path = require("path");

const dataDirectory = path.join(__dirname, "../../data");
const limitFile = path.join(dataDirectory, "ai-limits.json");

/** Fixed daily AI request allowance per server. Not configurable. */
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

function getGuildDailyLimit(guildId) {
    return DAILY_LIMIT;
}

function canUseAI(guildId) {
    if (!guildId) {
        return true;
    }
    const limits = loadLimits();
    const entry = normalizeGuildEntry(limits, guildId);
    return entry.count < getGuildDailyLimit(guildId);
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
    const limit = getGuildDailyLimit(guildId);
    if (!guildId) {
        return limit;
    }
    const limits = loadLimits();
    const entry = normalizeGuildEntry(limits, guildId);
    return Math.max(0, limit - entry.count);
}

function getUsage(guildId) {
    const limit = getGuildDailyLimit(guildId);
    if (!guildId) {
        return {
            used: 0,
            remaining: limit,
            limit,
            resetAt: getResetAt(),
            resetDescription: getResetDescription()
        };
    }
    const remaining = getRemaining(guildId);
    return {
        used: limit - remaining,
        remaining,
        limit,
        resetAt: getResetAt(),
        resetDescription: getResetDescription()
    };
}

module.exports = {
    getGuildDailyLimit,
    DAILY_LIMIT,
    canUseAI,
    useAI,
    getRemaining,
    getUsage,
    getResetAt,
    getResetDescription,
    getToday
};
