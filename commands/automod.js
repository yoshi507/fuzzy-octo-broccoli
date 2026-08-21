const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    loadDatabase,
    saveDatabase
} = require("../database/database.js");
const { mergeGuildConfig } = require("../utils/configSync.js");
const {
    normalizeWords,
    parseWordsFromDb,
    syncDiscordAutoMod,
    ensureDiscordSpamPreset
} = require("../utils/automod/helpers.js");

function getAutomod(guildId) {
    const db = loadDatabase();
    if (!db.automod) db.automod = {};
    if (!db.automod[guildId]) {
        db.automod[guildId] = {
            enabled: false,
            blockedWords: [],
            useDiscordAutoMod: true,
            discordRuleId: null
        };
    }
    if (typeof db.automod[guildId].blockedWords === "string") {
        db.automod[guildId].blockedWords = normalizeWords(
            db.automod[guildId].blockedWords
        );
    }
    if (!Array.isArray(db.automod[guildId].blockedWords)) {
        db.automod[guildId].blockedWords = [];
    }
    return db.automod[guildId];
}

function saveAutomod(guildId, node) {
    const db = loadDatabase();
    if (!db.automod) db.automod = {};
    db.automod[guildId] = node;
    saveDatabase(db);
    try {
        mergeGuildConfig("automod", guildId, {
            enabled: Boolean(node.enabled),
            blockedWords: Array.isArray(node.blockedWords)
                ? node.blockedWords.join(", ")
                : String(node.blockedWords || "")
        });
    } catch {
        /* dashboard mirror best-effort */
    }
}

function assertManageGuild(interaction) {
    const perms = interaction.memberPermissions || interaction.member?.permissions;
    if (perms?.has?.(PermissionFlagsBits.Administrator)) return true;
    if (perms?.has?.(PermissionFlagsBits.ManageGuild)) return true;
    return false;
}

async function applyDiscordSync(interaction, node) {
    const result = await syncDiscordAutoMod(interaction.guild, {
        enabled: node.enabled && node.useDiscordAutoMod !== false,
        words: node.blockedWords
    });
    if (result.ok && result.ruleId) {
        node.discordRuleId = result.ruleId;
        saveAutomod(interaction.guild.id, node);
    }
    return result;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("automod")
        .setDescription(
            "Configure OmniBot AutoMod (combines Omni + Discord native AutoMod)"
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName("enable")
                .setDescription(
                    "Enable AutoMod and sync blocked words to Discord AutoMod"
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("disable")
                .setDescription("Disable Omni + Discord AutoMod rules")
        )
        .addSubcommand((sub) =>
            sub
                .setName("addword")
                .setDescription("Add a blocked word/phrase")
                .addStringOption((opt) =>
                    opt
                        .setName("word")
                        .setDescription("Word or phrase to block")
                        .setRequired(true)
                        .setMaxLength(60)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("removeword")
                .setDescription("Remove a blocked word")
                .addStringOption((opt) =>
                    opt
                        .setName("word")
                        .setDescription("Word to unblock")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("list")
                .setDescription("List blocked words and Discord sync status")
        )
        .addSubcommand((sub) =>
            sub
                .setName("sync")
                .setDescription(
                    "Re-sync Omni keywords to Discord's built-in AutoMod"
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("discord")
                .setDescription(
                    "Use Discord native AutoMod for keyword blocking (recommended)"
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName("enabled")
                        .setDescription(
                            "On = Discord blocks messages natively; Off = Omni-only"
                        )
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: "❌ Server only.",
                ephemeral: true
            });
        }

        if (!assertManageGuild(interaction)) {
            return interaction.reply({
                content: "❌ You need the **Manage Server** permission to change AutoMod settings.",
                ephemeral: true
            });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const node = getAutomod(guildId);

        if (sub === "list") {
            const words = parseWordsFromDb(node);
            const wordList =
                words.length > 0
                    ? words.map((w) => `\`${w}\``).join(", ")
                    : "_none_";
            return interaction.reply({
                content:
                    `🛡️ **OmniBot AutoMod**\n` +
                    `Status: **${node.enabled ? "enabled" : "disabled"}**\n` +
                    `Discord native AutoMod: **${node.useDiscordAutoMod !== false ? "on" : "off"}**\n` +
                    `Blocked words (${words.length}): ${wordList}\n` +
                    (node.discordRuleId
                        ? `Discord rule id: \`${node.discordRuleId}\`\n`
                        : "") +
                    `\nDiscord shows AutoMod actions in **Server Settings → AutoMod** when sync is on.`,
                ephemeral: true
            });
        }

        if (sub === "enable") {
            node.enabled = true;
            if (node.useDiscordAutoMod === undefined) {
                node.useDiscordAutoMod = true;
            }
            saveAutomod(guildId, node);
            const sync = await applyDiscordSync(interaction, node);
            if (node.useDiscordAutoMod !== false) {
                await ensureDiscordSpamPreset(interaction.guild, true);
            }
            let extra = "";
            if (sync.ok && !sync.disabled) {
                extra = `\n✅ Synced **${sync.keywordCount}** keyword(s) to Discord AutoMod.`;
            } else if (!sync.ok) {
                extra = `\n⚠️ Discord sync: ${sync.message || sync.reason}. Omni in-chat filter still works.`;
            } else if (sync.disabled) {
                extra =
                    "\nℹ️ Add words with `/automod addword` so Discord AutoMod has keywords to enforce.";
            }
            return interaction.reply({
                content:
                    "🛡️ AutoMod **enabled**. Omni + Discord AutoMod work together." +
                    extra,
                ephemeral: true
            });
        }

        if (sub === "disable") {
            node.enabled = false;
            saveAutomod(guildId, node);
            await applyDiscordSync(interaction, node);
            return interaction.reply({
                content:
                    "🛡️ AutoMod **disabled**. Discord keyword rule was turned off.",
                ephemeral: true
            });
        }

        if (sub === "addword") {
            const word = interaction.options.getString("word", true);
            const words = new Set(parseWordsFromDb(node));
            const normalized = normalizeWords([word]);
            if (!normalized.length) {
                return interaction.reply({
                    content: "❌ Invalid word.",
                    ephemeral: true
                });
            }
            normalized.forEach((w) => words.add(w));
            node.blockedWords = [...words];
            saveAutomod(guildId, node);
            let syncNote = "";
            if (node.enabled && node.useDiscordAutoMod !== false) {
                const sync = await applyDiscordSync(interaction, node);
                syncNote = sync.ok
                    ? " Synced to Discord AutoMod."
                    : ` (Discord sync: ${sync.message || sync.reason})`;
            }
            return interaction.reply({
                content: `✅ Blocked \`${normalized[0]}\`.${syncNote}`,
                ephemeral: true
            });
        }

        if (sub === "removeword") {
            const word = interaction.options
                .getString("word", true)
                .toLowerCase()
                .trim();
            const before = parseWordsFromDb(node);
            node.blockedWords = before.filter((w) => w !== word);
            saveAutomod(guildId, node);
            if (node.enabled && node.useDiscordAutoMod !== false) {
                await applyDiscordSync(interaction, node);
            }
            return interaction.reply({
                content: before.includes(word)
                    ? `✅ Removed \`${word}\` from the block list.`
                    : `Word \`${word}\` was not on the list.`,
                ephemeral: true
            });
        }

        if (sub === "sync") {
            await interaction.deferReply({ ephemeral: true });
            const sync = await applyDiscordSync(interaction, node);
            if (node.useDiscordAutoMod !== false && node.enabled) {
                await ensureDiscordSpamPreset(interaction.guild, true);
            }
            if (sync.ok) {
                return interaction.editReply(
                    sync.disabled
                        ? "Discord AutoMod rule disabled (AutoMod off or no keywords)."
                        : `✅ Synced **${sync.keywordCount}** keyword(s) to Discord AutoMod.\nCheck **Server Settings → AutoMod** — Omni's rule should appear there.`
                );
            }
            return interaction.editReply(
                `❌ Discord sync failed: ${sync.message || sync.reason}`
            );
        }

        if (sub === "discord") {
            const enabled = interaction.options.getBoolean("enabled", true);
            node.useDiscordAutoMod = enabled;
            saveAutomod(guildId, node);
            const sync = await applyDiscordSync(interaction, node);
            return interaction.reply({
                content: enabled
                    ? `✅ Discord native AutoMod **on**.${
                          sync.ok
                              ? " Keywords sync to Server Settings → AutoMod."
                              : ` (${sync.message || sync.reason})`
                      }`
                    : "✅ Discord native AutoMod **off**. Omni will only use its own message filter.",
                ephemeral: true
            });
        }
    }
};
