const {
    translateText
} = require("../utils/translator.js");

const {
    getChannelSettings
} = require("../utils/ai/translation.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

const {
    addXP,
    handleLevelUpRole
} = require("../utils/leveling.js");

const {
    sendModLog
} = require("../utils/modLog.js");

module.exports = {
    name: "messageCreate",

    async execute(message) {
        // Ignore DMs and bots
        if (!message.guild || message.author.bot) {
            return;
        }

        // =========================
        // AUTO TRANSLATION (non-AI)
        // =========================

        const translationSettings =
            getChannelSettings(message.channel.id);

        if (
            translationSettings?.enabled &&
            message.content?.trim()
        ) {
            try {
                const translationResult = await translateText(
                    message.content,
                    translationSettings.language
                );
                const translation = translationResult?.text;

                if (translation) {
                    await message.reply(
                        `🌍 **${translationSettings.language}:** ${translation}`
                    );
                }
            } catch (error) {
                console.error("Auto translation error:", error.message || error);
            }
        }

        // =========================
        // DATABASE
        // =========================

        const database = loadDatabase();

        // =========================
        // AUTOMOD
        // =========================

        const automod = database.automod?.[message.guild.id];

        if (automod?.enabled && message.content) {
            const content = message.content.toLowerCase();

            const blockedWords = [
                "fuck",
                "fucker",
                "fucking",
                "shit",
                "bitch",
                "cunt",
                "nigger",
                "nigga"
            ];

            const hasBadWord = blockedWords.some(word =>
                content.includes(word)
            );

            const hasInvite =
                /discord(?:\.gg|\.com\/invite)\/[a-z0-9-]+/i.test(
                    message.content
                );

            if (hasBadWord || hasInvite) {
                try {
                    await message.delete();

                    const warning = await message.channel.send({
                        content: `⚠️ ${message.author}, your message was removed by AutoMod.`
                    });

                    setTimeout(() => {
                        warning.delete().catch(() => {});
                    }, 5000);

                    console.log(
                        `AutoMod removed a message from ${message.author.tag}`
                    );
                } catch (error) {
                    console.error("AutoMod error:", error);
                }

                return;
            }
        }

        // =========================
        // ANTI-SPAM
        // =========================

        if (!database.spam) {
            database.spam = {};
        }

        if (!database.spam[message.guild.id]) {
            database.spam[message.guild.id] = {};
        }

        const guildSpam = database.spam[message.guild.id];
        const userId = message.author.id;
        const now = Date.now();

        if (!guildSpam[userId]) {
            guildSpam[userId] = {
                messages: [],
                lastMessage: ""
            };
        }

        const userSpam = guildSpam[userId];

        userSpam.messages = userSpam.messages.filter(
            timestamp => now - timestamp < 8000
        );

        userSpam.messages.push(now);

        const repeated =
            message.content.length > 0 &&
            message.content === userSpam.lastMessage;

        userSpam.lastMessage = message.content;

        saveDatabase(database);

        if (userSpam.messages.length >= 6 || repeated) {
            try {
                await message.delete();
            } catch (error) {
                console.error("Anti-spam delete error:", error);
            }

            userSpam.messages = [];

            if (!userSpam.strikes) {
                userSpam.strikes = 0;
            }

            userSpam.strikes++;
            saveDatabase(database);

            if (userSpam.strikes >= 3) {
                const member = message.member;

                if (member && member.moderatable) {
                    try {
                        await member.timeout(
                            5 * 60 * 1000,
                            "Automatic anti-spam protection"
                        );

                        await sendModLog(message.guild, {
                            title: "🔇 Anti-Spam Timeout",
                            description: `${message.author} was automatically timed out for repeated spam.`,
                            userId: message.author.id,
                            moderatorId: message.client.user.id,
                            reason: "Automatic anti-spam protection"
                        });
                    } catch (error) {
                        console.error("Anti-spam timeout error:", error);
                    }
                }

                userSpam.strikes = 0;
                saveDatabase(database);
            } else {
                try {
                    const warning = await message.channel.send({
                        content: `⚠️ ${message.author}, please stop spamming.`
                    });

                    setTimeout(() => {
                        warning.delete().catch(() => {});
                    }, 5000);
                } catch (error) {
                    console.error("Anti-spam warning error:", error);
                }
            }

            return;
        }

        // =========================
        // LEVELING
        // =========================

        const settings = database.levelSettings?.[message.guild.id];

        if (settings?.enabled === false) {
            return;
        }

        try {
            const result = addXP(
                message.guild.id,
                message.author.id
            );

            if (result && result.levelledUp) {
                await message.channel.send(
                    `🎉 ${message.author} reached **Level ${result.level}**!`
                );

                await handleLevelUpRole(message.member, result.level);
            }
        } catch (error) {
            console.error("Leveling error:", error);
        }
    }
};
