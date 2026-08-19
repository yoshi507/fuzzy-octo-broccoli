const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "../data");
const economyFile = path.join(dataDir, "economy.json");

const STARTING_COINS = 100;
const DAILY_REWARD = 250;
const DAILY_STREAK_BONUS = 25;
const MAX_DAILY_STREAK = 14;
const WORK_REWARD_MIN = 40;
const WORK_REWARD_MAX = 120;
const WORK_COOLDOWN_MS = 60 * 60 * 1000;
const MIN_BET = 1;
const MAX_BET = 5000;

const SHOP = {
    cookie: {
        id: "cookie",
        name: "Cookie",
        price: 50,
        description: "A tasty cookie. Purely cosmetic."
    },
    star: {
        id: "star",
        name: "Lucky Star",
        price: 150,
        description: "A shiny star for your collection."
    },
    trophy: {
        id: "trophy",
        name: "Toy Trophy",
        price: 400,
        description: "Show off your wins."
    },
    gem: {
        id: "gem",
        name: "Blue Gem",
        price: 800,
        description: "A rare-looking virtual gem."
    },
    crown: {
        id: "crown",
        name: "Paper Crown",
        price: 1500,
        description: "Fit for a pretend monarch."
    }
};

function ensureStorage() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(economyFile)) {
        fs.writeFileSync(economyFile, "{}", "utf8");
    }
}

function loadEconomy() {
    ensureStorage();
    try {
        return JSON.parse(fs.readFileSync(economyFile, "utf8"));
    } catch {
        return {};
    }
}

function saveEconomy(data) {
    ensureStorage();
    const payload = JSON.stringify(data, null, 2);
    const tempFile = economyFile + ".tmp";
    fs.writeFileSync(tempFile, payload, "utf8");
    try {
        fs.renameSync(tempFile, economyFile);
    } catch {
        fs.writeFileSync(economyFile, payload, "utf8");
        try { fs.unlinkSync(tempFile); } catch {}
    }
}

function defaultUser() {
    return {
        coins: STARTING_COINS,
        lastDaily: null,
        dailyStreak: 0,
        lastWork: null,
        inventory: {},
        stats: {
            gamesPlayed: 0,
            gamesWon: 0,
            totalWagered: 0,
            totalWon: 0
        }
    };
}

function getUser(guildId, userId) {
    const data = loadEconomy();
    if (!data[guildId]) data[guildId] = { users: {} };
    if (!data[guildId].users) data[guildId].users = {};

    if (!data[guildId].users[userId]) {
        data[guildId].users[userId] = defaultUser();
        saveEconomy(data);
    } else {
        const u = data[guildId].users[userId];
        if (typeof u.coins !== "number" || Number.isNaN(u.coins) || u.coins < 0) {
            u.coins = 0;
        }
        u.coins = Math.floor(u.coins);
        if (!u.inventory || typeof u.inventory !== "object") u.inventory = {};
        if (!u.stats || typeof u.stats !== "object") {
            u.stats = { gamesPlayed: 0, gamesWon: 0, totalWagered: 0, totalWon: 0 };
        }
        data[guildId].users[userId] = u;
        saveEconomy(data);
    }

    return data[guildId].users[userId];
}

function mutateUser(guildId, userId, mutator) {
    const data = loadEconomy();
    if (!data[guildId]) data[guildId] = { users: {} };
    if (!data[guildId].users) data[guildId].users = {};
    if (!data[guildId].users[userId]) {
        data[guildId].users[userId] = defaultUser();
    }

    const user = data[guildId].users[userId];
    if (typeof user.coins !== "number" || Number.isNaN(user.coins)) user.coins = 0;
    user.coins = Math.max(0, Math.floor(user.coins));
    if (!user.inventory) user.inventory = {};
    if (!user.stats) {
        user.stats = { gamesPlayed: 0, gamesWon: 0, totalWagered: 0, totalWon: 0 };
    }

    const result = mutator(user);
    user.coins = Math.max(0, Math.floor(user.coins));
    data[guildId].users[userId] = user;
    saveEconomy(data);
    return { user, result };
}

function getBalance(guildId, userId) {
    return getUser(guildId, userId).coins;
}

function addCoins(guildId, userId, amount) {
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
        return { ok: false, reason: "invalid_amount" };
    }
    const { user } = mutateUser(guildId, userId, u => {
        u.coins += value;
    });
    return { ok: true, coins: user.coins, added: value };
}

function removeCoins(guildId, userId, amount) {
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
        return { ok: false, reason: "invalid_amount" };
    }
    const current = getBalance(guildId, userId);
    if (current < value) {
        return { ok: false, reason: "insufficient", coins: current };
    }
    const { user } = mutateUser(guildId, userId, u => {
        u.coins -= value;
    });
    return { ok: true, coins: user.coins, removed: value };
}

function transfer(guildId, fromId, toId, amount) {
    if (fromId === toId) {
        return { ok: false, reason: "self" };
    }
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
        return { ok: false, reason: "invalid_amount" };
    }

    const data = loadEconomy();
    if (!data[guildId]) data[guildId] = { users: {} };
    if (!data[guildId].users[fromId]) data[guildId].users[fromId] = defaultUser();
    if (!data[guildId].users[toId]) data[guildId].users[toId] = defaultUser();

    const from = data[guildId].users[fromId];
    const to = data[guildId].users[toId];
    from.coins = Math.max(0, Math.floor(from.coins || 0));
    to.coins = Math.max(0, Math.floor(to.coins || 0));

    if (from.coins < value) {
        return { ok: false, reason: "insufficient", coins: from.coins };
    }

    from.coins -= value;
    to.coins += value;
    saveEconomy(data);

    return { ok: true, fromCoins: from.coins, toCoins: to.coins, amount: value };
}

function claimDaily(guildId, userId) {
    const today = new Date().toISOString().slice(0, 10);

    const { user, result } = mutateUser(guildId, userId, u => {
        if (u.lastDaily === today) {
            return { claimed: false, reason: "already" };
        }

        let streak = Number(u.dailyStreak) || 0;
        const yesterday = new Date(Date.now() - 86400000)
            .toISOString()
            .slice(0, 10);

        if (u.lastDaily === yesterday) {
            streak = Math.min(MAX_DAILY_STREAK, streak + 1);
        } else {
            streak = 1;
        }

        const bonus = (streak - 1) * DAILY_STREAK_BONUS;
        const reward = DAILY_REWARD + bonus;

        u.coins += reward;
        u.lastDaily = today;
        u.dailyStreak = streak;

        return { claimed: true, reward, streak, bonus };
    });

    return { ...result, coins: user.coins };
}

function doWork(guildId, userId) {
    const now = Date.now();

    const { user, result } = mutateUser(guildId, userId, u => {
        const last = Number(u.lastWork) || 0;
        if (now - last < WORK_COOLDOWN_MS) {
            return {
                ok: false,
                reason: "cooldown",
                remainingMs: WORK_COOLDOWN_MS - (now - last)
            };
        }

        const reward =
            Math.floor(Math.random() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) +
            WORK_REWARD_MIN;

        u.coins += reward;
        u.lastWork = now;
        return { ok: true, reward };
    });

    return { ...result, coins: user.coins };
}

function recordGame(guildId, userId, { wagered = 0, won = 0, win = false } = {}) {
    mutateUser(guildId, userId, u => {
        u.stats.gamesPlayed = (u.stats.gamesPlayed || 0) + 1;
        if (win) u.stats.gamesWon = (u.stats.gamesWon || 0) + 1;
        u.stats.totalWagered = (u.stats.totalWagered || 0) + Math.max(0, wagered);
        u.stats.totalWon = (u.stats.totalWon || 0) + Math.max(0, won);
    });
}

function placeBet(guildId, userId, amount) {
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value < MIN_BET) {
        return { ok: false, reason: "min_bet", min: MIN_BET };
    }
    if (value > MAX_BET) {
        return { ok: false, reason: "max_bet", max: MAX_BET };
    }
    const removed = removeCoins(guildId, userId, value);
    if (!removed.ok) {
        return removed;
    }
    return { ok: true, bet: value, coins: removed.coins };
}

function buyItem(guildId, userId, itemId) {
    const item = SHOP[itemId];
    if (!item) {
        return { ok: false, reason: "unknown_item" };
    }

    const data = loadEconomy();
    if (!data[guildId]) data[guildId] = { users: {} };
    if (!data[guildId].users[userId]) data[guildId].users[userId] = defaultUser();

    const user = data[guildId].users[userId];
    user.coins = Math.max(0, Math.floor(user.coins || 0));
    if (!user.inventory) user.inventory = {};

    if (user.coins < item.price) {
        return { ok: false, reason: "insufficient", coins: user.coins, price: item.price };
    }

    user.coins -= item.price;
    user.inventory[item.id] = (user.inventory[item.id] || 0) + 1;
    saveEconomy(data);

    return {
        ok: true,
        item,
        coins: user.coins,
        owned: user.inventory[item.id]
    };
}

function getInventory(guildId, userId) {
    const user = getUser(guildId, userId);
    return user.inventory || {};
}

function getLeaderboard(guildId, limit = 10) {
    const data = loadEconomy();
    const users = data[guildId]?.users || {};
    return Object.entries(users)
        .map(([id, u]) => ({
            userId: id,
            coins: Math.max(0, Math.floor(u.coins || 0))
        }))
        .sort((a, b) => b.coins - a.coins)
        .slice(0, limit);
}

function parseBetAmount(raw) {
    if (raw == null) return null;
    const cleaned = String(raw).trim().toLowerCase().replace(/,/g, "");
    if (cleaned === "all" || cleaned === "max") return "all";
    const n = Math.floor(Number(cleaned));
    if (!Number.isFinite(n)) return null;
    return n;
}

function resolveBetAmount(guildId, userId, raw) {
    const parsed = parseBetAmount(raw);
    if (parsed === null) {
        return { ok: false, reason: "invalid_amount" };
    }
    const balance = getBalance(guildId, userId);
    let amount = parsed === "all" ? Math.min(balance, MAX_BET) : parsed;
    amount = Math.floor(amount);
    if (amount < MIN_BET) {
        return { ok: false, reason: "min_bet", min: MIN_BET };
    }
    if (amount > MAX_BET) {
        return { ok: false, reason: "max_bet", max: MAX_BET };
    }
    if (amount > balance) {
        return { ok: false, reason: "insufficient", coins: balance };
    }
    return { ok: true, amount, balance };
}

module.exports = {
    STARTING_COINS,
    DAILY_REWARD,
    DAILY_STREAK_BONUS,
    WORK_COOLDOWN_MS,
    MIN_BET,
    MAX_BET,
    SHOP,
    getUser,
    getBalance,
    addCoins,
    removeCoins,
    transfer,
    claimDaily,
    doWork,
    placeBet,
    recordGame,
    buyItem,
    getInventory,
    getLeaderboard,
    parseBetAmount,
    resolveBetAmount
};
