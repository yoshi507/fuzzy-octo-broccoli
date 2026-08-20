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

        try {
            const { touchActivity } = require("../utils/ai/deadChat.js");
            touchActivity(message.channel.id);
        } catch {
            /* non-fatal */
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

            const autoTranslate =
                database.autoTranslate?.[message.guild.id];

            if (
                autoTranslate?.enabled &&
                autoTranslate.target &&
                !message.content.startsWith("/")
            ) {
                const translated = await translateText(
                    message.content,
                    autoTranslate.target
                );

                if (
                    translated &&
                    translated.toLowerCase() !==
                        message.content.toLowerCase()
                ) {
                    await message.reply({
                        content:
                            `🌐 **Auto-translate → ${autoTranslate.target}**\n${translated}`,
                        allowedMentions: { repliedUser: false }
                    }).catch(() => {});
                }
            }
        } catch (error) {
            if (error?.code !== "TRANSLATE_FAILED") {
                console.error(
                    "Auto-translate error:",
                    error?.message || error
                );
            }
        }

        try {
            const database = loadDatabase();
            const automod = database.automod?.[message.guild.id];

            if (automod?.enabled && Array.isArray(automod.blockedWords)) {
                const content = message.content.toLowerCase();
                const hit = automod.blockedWords.find((w) =>
                    w && content.includes(String(w).toLowerCase())
                );

                if (hit) {
                    await message.delete().catch(() => {});
                    await message.channel
                        .send({
                            content: `${message.author}, that message was removed by AutoMod.`,
                            allowedMentions: { users: [message.author.id] }
                        })
                        .then((m) => {
                            setTimeout(() => m.delete().catch(() => {}), 5000);
                        })
                        .catch(() => {});

                    await sendModLog(message.guild, {
                        title: "AutoMod",
                        description: `Blocked word in ${message.channel}`,
                        userId: message.author.id,
                        moderatorId: message.client.user.id,
                        reason: `Matched: ${hit}`
                    }).catch(() => {});

                    return;
                }
            }
        } catch (error) {
            console.error("Automod error:", error?.message || error);
        }

        try {
            const database = loadDatabase();

            if (!database.spam) database.spam = {};
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
                    guildSpam[userId] = [];
                }

                guildSpam[userId] = guildSpam[userId].filter(
                    (t) => now - t < 7000
                );
                guildSpam[userId].push(now);
                saveDatabase(database);

                if (guildSpam[userId].length >= 6) {
                    const member = message.member;
                    if (member?.moderatable) {
                        await member
                            .timeout(60_000, "Anti-spam")
                            .catch(() => {});
                    }
                    guildSpam[userId] = [];
                    saveDatabase(database);
                    await message.channel
                        .send(
                            `${message.author} slowed down — anti-spam timeout applied.`
                        )
                        .catch(() => {});
                }
            }
        } catch (error) {
            console.error("Anti-spam error:", error?.message || error);
        }

        try {
            const database = loadDatabase();
            const settings = database.levelSettings?.[message.guild.id];

            if (settings?.enabled !== false) {
                const result = addXP(
                    message.guild.id,
                    message.author.id,
                    message.member
                );

                if (result?.leveledUp) {
                    await handleLevelUpRole(
                        message.member,
                        result.level
                    ).catch(() => {});

                    if (settings?.announce !== false) {
                        await message.channel
                            .send(
                                `🎉 ${message.author} reached **level ${result.level}**!`
                            )
                            .catch(() => {});
                    }
                }
            }
        } catch (error) {
            console.error("Leveling error:", error?.message || error);
        }
    }
};
