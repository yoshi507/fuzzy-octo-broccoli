/**
 * Shared AutoMod helpers — keyword normalization + Discord rule sync.
 */

const {
    AutoModerationRuleEventType,
    AutoModerationRuleTriggerType,
    AutoModerationActionType,
    PermissionFlagsBits
} = require("discord.js");

const RULE_NAME = "OmniBot AutoMod Keywords";
const MAX_KEYWORDS = 100;
const MAX_KEYWORD_LEN = 60;

function normalizeWords(input) {
    if (Array.isArray(input)) {
        return [
            ...new Set(
                input
                    .map((w) => String(w || "").trim().toLowerCase())
                    .filter((w) => w && w.length <= MAX_KEYWORD_LEN)
            )
        ].slice(0, MAX_KEYWORDS);
    }
    if (typeof input === "string") {
        return normalizeWords(
            input
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean)
        );
    }
    return [];
}

function parseWordsFromDb(automodNode) {
    if (!automodNode) return [];
    return normalizeWords(automodNode.blockedWords);
}

async function syncDiscordAutoMod(guild, { enabled, words }) {
    if (!guild) return { ok: false, reason: "no_guild" };

    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return {
            ok: false,
            reason: "missing_permission",
            message:
                "Omni needs **Manage Server** to create Discord AutoMod rules."
        };
    }

    const keywords = normalizeWords(words);

    try {
        const rules = await guild.autoModerationRules.fetch();
        let existing = rules.find(
            (r) =>
                r.name === RULE_NAME ||
                r.name === "OmniBot Blocked Words"
        );

        if (!enabled || keywords.length === 0) {
            if (existing) {
                await existing.edit({ enabled: false }).catch(async () => {
                    await existing.delete("OmniBot AutoMod disabled").catch(() => {});
                });
            }
            return {
                ok: true,
                ruleId: existing?.id || null,
                disabled: true,
                keywordCount: keywords.length
            };
        }

        const payload = {
            name: RULE_NAME,
            eventType: AutoModerationRuleEventType.MessageSend,
            triggerType: AutoModerationRuleTriggerType.Keyword,
            triggerMetadata: {
                keywordFilter: keywords.slice(0, MAX_KEYWORDS)
            },
            actions: [
                {
                    type: AutoModerationActionType.BlockMessage,
                    metadata: {
                        customMessage:
                            "This message was blocked by OmniBot AutoMod."
                    }
                }
            ],
            enabled: true,
            reason: "OmniBot AutoMod sync"
        };

        if (existing) {
            await existing.edit({
                name: RULE_NAME,
                enabled: true,
                triggerMetadata: payload.triggerMetadata,
                actions: payload.actions,
                reason: "OmniBot AutoMod sync"
            });
            return {
                ok: true,
                ruleId: existing.id,
                keywordCount: keywords.length,
                updated: true
            };
        }

        const created = await guild.autoModerationRules.create(payload);
        return {
            ok: true,
            ruleId: created.id,
            keywordCount: keywords.length,
            created: true
        };
    } catch (err) {
        console.error("[AutoMod] Discord sync failed:", err?.message || err);
        return {
            ok: false,
            reason: "api_error",
            message: err?.message || "Discord AutoMod API error"
        };
    }
}

async function ensureDiscordSpamPreset(guild, enabled) {
    if (!guild || !enabled) return { ok: true, skipped: true };
    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return { ok: false, reason: "missing_permission" };
    }

    const PRESET_NAME = "OmniBot AutoMod Content Presets";
    try {
        const { AutoModerationRuleKeywordPresetType } = require("discord.js");
        const rules = await guild.autoModerationRules.fetch();
        let existing = rules.find((r) => r.name === PRESET_NAME);
        if (existing) {
            if (!existing.enabled) await existing.edit({ enabled: true });
            return { ok: true, ruleId: existing.id };
        }

        const created = await guild.autoModerationRules.create({
            name: PRESET_NAME,
            eventType: AutoModerationRuleEventType.MessageSend,
            triggerType: AutoModerationRuleTriggerType.KeywordPreset,
            triggerMetadata: {
                presets: [
                    AutoModerationRuleKeywordPresetType.Profanity,
                    AutoModerationRuleKeywordPresetType.SexualContent,
                    AutoModerationRuleKeywordPresetType.Slurs
                ]
            },
            actions: [
                {
                    type: AutoModerationActionType.BlockMessage,
                    metadata: {
                        customMessage:
                            "This message was blocked by OmniBot (Discord AutoMod presets)."
                    }
                }
            ],
            enabled: true,
            reason: "OmniBot AutoMod content presets"
        });
        return { ok: true, ruleId: created.id, created: true };
    } catch (err) {
        console.warn("[AutoMod] Content preset skipped:", err?.message || err);
        return { ok: false, reason: "preset_unavailable", message: err?.message };
    }
}

module.exports = {
    RULE_NAME,
    normalizeWords,
    parseWordsFromDb,
    syncDiscordAutoMod,
    ensureDiscordSpamPreset
};
