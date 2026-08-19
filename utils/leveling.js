const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

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
    }

    saveDatabase(database);

    return database.levels[guildId][userId];
}

function xpNeeded(level) {
    return 100 + (level * 50);
}

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

    const user = database.levels[guildId][userId];

    user.xp += amount;
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
        levelledUp
    };
}

async function handleLevelUpRole(guild, userId, level) {
    const database = loadDatabase();

    const rewards = database.levelRewards?.[guild.id];

    if (!rewards) return;

    const currentRoleId = rewards[String(level)];

    if (!currentRoleId) return;

    const member = await guild.members
        .fetch(userId)
        .catch(() => null);

    if (!member) return;

    const currentRole = guild.roles.cache.get(currentRoleId);

    if (!currentRole) return;

    if (currentRole.position >= guild.members.me.roles.highest.position) {
        return;
    }

    // Remove lower-level reward roles
    for (const [rewardLevel, roleId] of Object.entries(rewards)) {
        const rewardLevelNumber = Number(rewardLevel);

        if (rewardLevelNumber < level && roleId !== currentRoleId) {
            const oldRole = guild.roles.cache.get(roleId);

            if (
                oldRole &&
                member.roles.cache.has(oldRole.id)
            ) {
                await member.roles.remove(oldRole).catch(() => {});
            }
        }
    }

    // Give the new role
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
