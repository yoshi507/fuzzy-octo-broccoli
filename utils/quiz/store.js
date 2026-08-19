const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../data/quiz.json");

function ensure() {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ guilds: {}, stats: {} }, null, 2));
    }
}

function load() {
    ensure();
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { guilds: {}, stats: {} };
    }
}

function save(data) {
    ensure();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function defaultSettings() {
    return {
        enabled: true,
        channelId: null,
        questionCount: 5,
        timeLimitSeconds: 20,
        pointsCorrect: 10,
        streakBonus: 2,
        cooldownSeconds: 30,
        rewardsEnabled: true,
        coinRewardPerPoint: 2,
        leaderboardEnabled: true,
        restricted: false,
        embedColor: 0x57f287
    };
}

function getSettings(guildId) {
    const data = load();
    return { ...defaultSettings(), ...(data.guilds[guildId]?.settings || {}) };
}

function setSettings(guildId, patch) {
    const data = load();
    if (!data.guilds[guildId]) data.guilds[guildId] = { settings: defaultSettings(), customQuestions: [] };
    data.guilds[guildId].settings = { ...getSettings(guildId), ...patch };
    save(data);
    return data.guilds[guildId].settings;
}

function getCustomQuestions(guildId) {
    const data = load();
    return data.guilds[guildId]?.customQuestions || [];
}

function setCustomQuestions(guildId, questions) {
    const data = load();
    if (!data.guilds[guildId]) data.guilds[guildId] = { settings: defaultSettings(), customQuestions: [] };
    data.guilds[guildId].customQuestions = questions;
    save(data);
}

function getStats(guildId, userId) {
    const data = load();
    const key = `${guildId}:${userId}`;
    return data.stats[key] || { correct: 0, wrong: 0, quizzes: 0, points: 0, bestStreak: 0 };
}

function addStats(guildId, userId, delta) {
    const data = load();
    const key = `${guildId}:${userId}`;
    const cur = getStats(guildId, userId);
    data.stats[key] = {
        correct: cur.correct + (delta.correct || 0),
        wrong: cur.wrong + (delta.wrong || 0),
        quizzes: cur.quizzes + (delta.quizzes || 0),
        points: cur.points + (delta.points || 0),
        bestStreak: Math.max(cur.bestStreak, delta.streak || 0)
    };
    save(data);
    return data.stats[key];
}

function leaderboard(guildId, limit = 10) {
    const data = load();
    const rows = [];
    for (const [key, val] of Object.entries(data.stats || {})) {
        if (!key.startsWith(`${guildId}:`)) continue;
        const userId = key.slice(guildId.length + 1);
        rows.push({ userId, ...val });
    }
    rows.sort((a, b) => b.points - a.points || b.correct - a.correct);
    return rows.slice(0, limit);
}

module.exports = {
    defaultSettings,
    getSettings,
    setSettings,
    getCustomQuestions,
    setCustomQuestions,
    getStats,
    addStats,
    leaderboard
};
