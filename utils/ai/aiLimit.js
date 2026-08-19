const fs = require("fs");
const path = require("path");

const dataDirectory =
    path.join(__dirname, "../../data");

const limitFile =
    path.join(dataDirectory, "ai-limits.json");

const DAILY_LIMIT = 20;

function ensureStorage() {

    if (!fs.existsSync(dataDirectory)) {
        fs.mkdirSync(dataDirectory, {
            recursive: true
        });
    }

    if (!fs.existsSync(limitFile)) {
        fs.writeFileSync(
            limitFile,
            "{}",
            "utf8"
        );
    }
}

function loadLimits() {

    ensureStorage();

    try {
        return JSON.parse(
            fs.readFileSync(
                limitFile,
                "utf8"
            )
        );
    } catch {
        return {};
    }
}

function saveLimits(limits) {

    ensureStorage();

    fs.writeFileSync(
        limitFile,
        JSON.stringify(
            limits,
            null,
            2
        ),
        "utf8"
    );
}

function getToday() {

    return new Date()
        .toISOString()
        .slice(0, 10);
}

function canUseAI(guildId) {

    if (!guildId) {
        return true;
    }

    const limits = loadLimits();
    const today = getToday();

    if (!limits[guildId]) {
        limits[guildId] = {
            date: today,
            count: 0
        };
    }

    if (limits[guildId].date !== today) {
        limits[guildId] = {
            date: today,
            count: 0
        };
    }

    return limits[guildId].count < DAILY_LIMIT;
}

function useAI(guildId) {

    if (!guildId) {
        return;
    }

    const limits = loadLimits();
    const today = getToday();

    if (
        !limits[guildId] ||
        limits[guildId].date !== today
    ) {
        limits[guildId] = {
            date: today,
            count: 0
        };
    }

    limits[guildId].count++;

    saveLimits(limits);
}

function getRemaining(guildId) {

    if (!guildId) {
        return DAILY_LIMIT;
    }

    const limits = loadLimits();
    const today = getToday();

    if (
        !limits[guildId] ||
        limits[guildId].date !== today
    ) {
        return DAILY_LIMIT;
    }

    return Math.max(
        0,
        DAILY_LIMIT - limits[guildId].count
    );
}

module.exports = {
    DAILY_LIMIT,
    canUseAI,
    useAI,
    getRemaining
};
