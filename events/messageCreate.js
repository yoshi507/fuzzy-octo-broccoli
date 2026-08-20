const {
    translateText,
    resolveLanguageCode
} = require("../utils/translator.js");

const {
    handleTextInvocation
} = require("../utils/textCommands.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");

const {
    addXP,
    handleLevelUpRole
} = require("../utils/leveling.js");

const { sendModLog } = require("../utils/modLog.js");

module.exports = {
    name: "messageCreate",

    async execute(message) {
        if (!message.guild || message.author.bot) {
            return;
        }

        let wasInvocation = false;
        try {
            wasInvocation = await handleTextInvocation(message);
            if (wasInvocation) return;
        } catch (error) {
            console.error(
                "Text invocation error:",
                error?.code || error?.message || error
            );
        }

        try {
            const database = loadDatabase();
            const translationSettings =
                database.autoTranslate?.[message.guild.id];

            if (
                translationSettings?.enabled &&
                translationSettings.language &&
                message.content &&
                message.content.trim().length > 0
            ) {
                const content = message.content.trim();
                const translationResult = await translateText(
                    content,
                    translationSettings.language
                );
                const translation = translationResult?.text;
                if (
                    translation &&
                    translation.trim().toLowerCase() !== content.toLowerCase()
                ) {
                    await message.reply({
                        content: `🌍 **${translationSettings.language}:** ${translation}`,
                        allowedMentions: { repliedUser: false }
                    });
                }
            }
        } catch (error) {
            console.error(
                "Auto translation error:",
                error?.code || error?.message || error
            );
        }

        const database = loadDatabase();

        const automod = database.automod?.[message.guild.id];

        if (automod?.enabled && message.content) {
            const content = message.content.toLowerCase();

            const defaultBlocked = [
                "fuck",
                "fucker",
                "fucking",
                "shit",
                "bitch",
                "cunt",
                "nigger",
                "nigga"
            ];
            const customBlocked = String(automod.blockedWords || "")
                .split(/[\n,]+/)
                .map((w) => w.trim().toLowerCase())
                .filter(Boolean);
            const blockedWords = [...new Set([...defaultBlocked, ...customBlocked])];

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
                } catch (error) {
                    console.error("AutoMod error:", error);
                }

                return;
            }
        }

        if (!database.spam) {
            database.spam = {};
        }

        if (!database.spam[message.guild.id]) {
            database.spam[message.guild.id] = {};
        }

        const spamEnabled =
            database.spamConfig?.[message.guild.id]?.enabled !== false;

        if (spamEnabled) {
            const guildSpam = database.spam[message.guild.id];
            const userId = message.author.id;
            const now = Date.now();

            if (!guildSpam[userId]) {
                guildSpam[userId] = {
                    messages: [],
                    warned: false
                };
            }

            const userData = guildSpam[userId];
            userData.messages = userData.messages.filter(
                timestamp => now - timestamp < 5000
            );
            userData.messages.push(now);

            if (userData.messages.length >= 5) {
                try {
                    await message.delete();
                } catch (error) {
                    console.error("Anti-spam delete error:", error);
                }

                if (!userData.warned) {
                    userData.warned = true;

                    if (
                        message.member &&
                        message.member.moderatable
                    ) {
                        try {
                            await message.member.timeout(
                                10 * 1000,
                                "Automatic anti-spam protection"
                            );

                            await sendModLog(message.guild, {
                                action: "Timeout",
                                user: message.author,
                                moderator: message.client.user,
                                reason: "Automatic anti-spam protection"
                            });
                        } catch (error) {
                            console.error("Anti-spam timeout error:", error);
                        }
                    }

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
        }

        const settings = database.levelSettings?.[message.guild.id];

        if (settings?.enabled === false) {
            return;
        }

        try {
            const result = await addXP(
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
            console.error("Leveling error:", error?.message || error);
        }
    }
};
