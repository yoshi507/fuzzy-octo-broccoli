const {
    translateText,
    resolveLanguageCode
} = require("../utils/translator.js");

const {
    handleTextInvocation
} = require("../utils/textCommands.js");

const {
    loadDatabase
} = require("../database/database.js");

module.exports = {
    name: "messageCreate",

    async execute(message) {
        if (!message.guild || message.author.bot) {
            return;
        }

        // Prefix / natural Omni invocation (non-AI + AI)
        try {
            const handled = await handleTextInvocation(message);
            if (handled) return;
        } catch (error) {
            console.error(
                "Text invocation error:",
                error?.code || error?.message || error
            );
        }

        // Auto-translate (non-AI)
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

        // Anti-spam (uses spamConfig.enabled when present)
        if (!database.spam) {
            database.spam = {};
        }

        if (!database.spam[message.guild.id]) {
            database.spam[message.guild.id] = {};
        }

        const spamEnabled = database.spamConfig?.[message.guild.id]?.enabled !== false;
        if (!spamEnabled) {
            return;
        }

        const guildSpam = database.spam[message.guild.id];
        const userId = message.author.id;
        const now = Date.now();

        if (!guildSpam[userId]) {
            guildSpam[userId] = {
                messages: [],
                warned: false
            };
        }

        const userSpam = guildSpam[userId];
        userSpam.messages = (userSpam.messages || []).filter(
            (ts) => now - ts < 7000
        );
        userSpam.messages.push(now);

        if (userSpam.messages.length >= 6) {
            try {
                if (message.member?.moderatable) {
                    await message.member.timeout(60 * 1000, "Anti-spam");
                }
                await message.channel.send(
                    `⏳ ${message.author} slowed down for spam.`
                ).then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
            } catch (error) {
                console.error("Anti-spam error:", error?.message || error);
            }
            userSpam.messages = [];
        }
    }
};
