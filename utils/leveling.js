const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

function normalizeUser(user) {
    if (!user || typeof user !== "object") {
        return { xp: 0, level: 0, messages: 0 };
    }
    return {
        xp: typeof user.xp === "number" && !Number.isNaN(user.xp) ? user.xp : 0,
        level: typeof user.level === "number" && !Number.isNaN(user.level) ? user.level : 0,
        messages: typeof user.messages === "number" && !Number.isNaN(user.messages) ? user.messages : 0
    };
}

function getUserData(guildId, userId) {
    const database = loadDatabase();

    if (!database.levels) {
        database.levels = {};
    }

    if (!database.levels[guildId]) {
        database.levels[guildId] = {};
    }

    if (!database.levels[guildId][userId]) {
        database.levels[guildId][userId] = {
            xp: 0,
            level: 0,
            messages: 0
        };
        saveDatabase(database);
    } else {
        // Repair null/invalid values from older data
        const fixed = normalizeUser(database.levels[guildId][userId]);
        if (
            database.levels[guildId][userId].xp !== fixed.xp ||
            database.levels[guildId][userId].level !== fixed.level ||
            database.levels[guildId][userId].messages !== fixed.messages
        ) {
            database.levels[guildId][userId] = fixed;
            saveDatabase(database);
        }
    }

    return database.levels[guildId][userId];
}

function xpNeeded(level) {
    return 100 + (level * 50);
}

/**
 * Add XP to a user. amount defaults to a random 15-25 if omitted.
 */
function addXP(guildId, userId, amount) {
    const database = loadDatabase();

    if (!database.levels) {
        database.levels = {};
    }

    if (!database.levels[guildId]) {
        database.levels[guildId] = {};
    }

    if (!database.levels[guildId][userId]) {
        database.levels[guildId][userId] = {
            xp: 0,
            level: 0,
            messages: 0
        };
    }

    const user = normalizeUser(database.levels[guildId][userId]);
    database.levels[guildId][userId] = user;

    const xpGain =
        typeof amount === "number" && amount > 0
            ? amount
            : Math.floor(Math.random() * 11) + 15;

    user.xp += xpGain;
    user.messages += 1;

    let levelledUp = false;

    while (user.xp >= xpNeeded(user.level)) {
        user.xp -= xpNeeded(user.level);
        user.level += 1;
        levelledUp = true;
    }

    saveDatabase(database);

    return {
        user,
        level: user.level,
        levelledUp,
        xpGain
    };
}

/**
 * Assign level reward roles.
 * Accepts either (member, level) or (guild, userId, level) for compatibility.
 */
async function handleLevelUpRole(memberOrGuild, userIdOrLevel, maybeLevel) {
    let member;
    let level;

    // Signature: handleLevelUpRole(member, level)
    if (memberOrGuild && memberOrGuild.guild && memberOrGuild.user) {
        member = memberOrGuild;
        level = userIdOrLevel;
    } else {
        // Signature: handleLevelUpRole(guild, userId, level)
        const guild = memberOrGuild;
        const userId = userIdOrLevel;
        level = maybeLevel;

        if (!guild || !userId || level == null) {
            return;
        }

        member = await guild.members.fetch(userId).catch(() => null);
    }

    if (!member || level == null) {
        return;
    }

    const guild = member.guild;
    const database = loadDatabase();
    const rewards = database.levelRewards?.[guild.id];

    if (!rewards) {
        return;
    }

    const currentRoleId = rewards[String(level)];

    if (!currentRoleId) {
        return;
    }

    const currentRole = guild.roles.cache.get(currentRoleId);

    if (!currentRole) {
        return;
    }

    const me = guild.members.me;
    if (me && currentRole.position >= me.roles.highest.position) {
        return;
    }

    for (const [rewardLevel, roleId] of Object.entries(rewards)) {
        const rewardLevelNumber = Number(rewardLevel);

        if (rewardLevelNumber < level && roleId !== currentRoleId) {
            const oldRole = guild.roles.cache.get(roleId);

            if (oldRole && member.roles.cache.has(oldRole.id)) {
                await member.roles.remove(oldRole).catch(() => {});
            }
        }
    }

    if (!member.roles.cache.has(currentRole.id)) {
        await member.roles.add(currentRole).catch(() => {});
    }
}

module.exports = {
    getUserData,
    addXP,
    xpNeeded,
    handleLevelUpRole
};
