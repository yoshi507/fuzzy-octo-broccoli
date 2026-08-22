/**
 * Server growth advisor — analyzes guild snapshot via Groq.
 * Consumes 1 AI request per analyze. Execute uses zero AI.
 */

const { askAI, formatAiUserError } = require("./groq.js");
const { canUseAI, useAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const { getGuildSettings, applyPatch } = require("../../api/services/settingsBridge.js");
const { ChannelType, PermissionFlagsBits } = require("discord.js");

const SAFE_SETTING_KEYS = new Set([
    "ai.enabled",
    "ai.naturalInvocation",
    "deadchat.enabled",
    "deadchat.minutes",
    "leveling.enabled",
    "welcome.enabled",
    "goodbye.enabled",
    "logging.enabled",
    "moderation.automodEnabled",
    "tickets.enabled",
    "appeals.enabled"
]);

function buildGuildSnapshot(guild, settings) {
    const channels = [...guild.channels.cache.values()]
        .filter((c) => c && c.name)
        .slice(0, 80)
        .map((c) => ({
            id: c.id,
            name: c.name,
            type:
                c.type === ChannelType.GuildText
                    ? "text"
                    : c.type === ChannelType.GuildVoice
                      ? "voice"
                      : c.type === ChannelType.GuildCategory
                        ? "category"
                        : c.type === ChannelType.GuildAnnouncement
                          ? "announcement"
                          : String(c.type),
            topic: c.topic ? String(c.topic).slice(0, 120) : null,
            parent: c.parent?.name || null
        }));

    const roles = [...guild.roles.cache.values()]
        .filter((r) => r && !r.managed)
        .sort((a, b) => b.position - a.position)
        .slice(0, 40)
        .map((r) => ({
            id: r.id,
            name: r.name,
            color: r.hexColor,
            members: r.members?.cache?.size ?? null,
            hoist: r.hoist,
            mentionable: r.mentionable
        }));

    const featureFlags = {};
    for (const k of SAFE_SETTING_KEYS) {
        if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
            featureFlags[k] = settings[k];
        }
    }

    return {
        guild: {
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
            premiumTier: guild.premiumTier,
            preferredLocale: guild.preferredLocale,
            description: guild.description || null,
            createdTimestamp: guild.createdTimestamp
        },
        channels,
        roles,
        omniFeatures: featureFlags
    };
}

function extractJson(text) {
    const raw = String(text || "").trim();
    try {
        return JSON.parse(raw);
    } catch {
        /* fall through */
    }
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
        try {
            return JSON.parse(fence[1].trim());
        } catch {
            /* fall through */
        }
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(raw.slice(start, end + 1));
        } catch {
            /* fall through */
        }
    }
    return null;
}

async function analyzeGuild(guild, options = {}) {
    const guildId = guild.id;
    if (!canUseAI(guildId)) {
        const err = new Error("AI daily limit reached");
        err.code = "AI_DAILY_LIMIT";
        err.guildId = guildId;
        throw err;
    }

    const settings = getGuildSettings(guildId);
    const snapshot = buildGuildSnapshot(guild, settings);

    const system = `You are OmniBot's Server Growth Advisor for Discord communities.
Analyze the provided server snapshot and return ONLY valid JSON (no markdown) with this shape:
{
  "summary": "2-4 sentence overview",
  "growthScore": 1-10,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": [
    {
      "id": "r1",
      "title": "short title",
      "detail": "why this helps growth",
      "impact": "high|medium|low",
      "action": null
    }
  ]
}

Rules for recommendations.action (only when safe and useful):
- settings_patch: { "type":"settings_patch", "patch": { "<setting.id>": value } }
  Allowed setting keys only: ${[...SAFE_SETTING_KEYS].join(", ")}
- create_text_channel: { "type":"create_text_channel", "name":"channel-name", "topic":"optional topic" }
- create_role: { "type":"create_role", "name":"Role Name", "hoist": false, "mentionable": false }
- Or action: null for advice-only items.

Prefer growth: clear onboarding, engagement channels, leveling, welcome, reaction roles, dead-chat revival, moderation hygiene.
Do NOT recommend deleting channels/roles, banning people, or changing dangerous permissions.
Max 6 recommendations. Keep channel/role names Discord-safe (lowercase, hyphens for channels).`;

    const userMsg =
        "Analyze this Discord server and suggest improvements for member growth and engagement:\n" +
        JSON.stringify(snapshot);

    const reply = await askAI(
        [
            { role: "system", content: system },
            { role: "user", content: userMsg }
        ],
        { guildId, maxTokens: 1200, temperature: 0.4, applyPersona: false }
    );

    let plan = extractJson(reply);
    if (!plan || typeof plan !== "object") {
        plan = {
            summary: String(reply || "").slice(0, 800),
            growthScore: null,
            strengths: [],
            weaknesses: [],
            recommendations: []
        };
    }

    const recs = Array.isArray(plan.recommendations) ? plan.recommendations : [];
    plan.recommendations = recs.slice(0, 8).map((r, i) => {
        const action = sanitizeAction(r?.action);
        return {
            id: String(r?.id || `r${i + 1}`).slice(0, 32),
            title: String(r?.title || "Suggestion").slice(0, 120),
            detail: String(r?.detail || "").slice(0, 600),
            impact: ["high", "medium", "low"].includes(String(r?.impact).toLowerCase())
                ? String(r.impact).toLowerCase()
                : "medium",
            action
        };
    });

    return {
        plan,
        remaining: getRemaining(guildId),
        limit: DAILY_LIMIT,
        analyzedAt: new Date().toISOString()
    };
}

function sanitizeAction(action) {
    if (!action || typeof action !== "object") return null;
    const type = String(action.type || "");
    if (type === "settings_patch") {
        const patch = {};
        const src = action.patch && typeof action.patch === "object" ? action.patch : {};
        for (const [k, v] of Object.entries(src)) {
            if (SAFE_SETTING_KEYS.has(k)) patch[k] = v;
        }
        if (!Object.keys(patch).length) return null;
        return { type: "settings_patch", patch };
    }
    if (type === "create_text_channel") {
        const name = String(action.name || "")
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 32);
        if (!name) return null;
        return {
            type: "create_text_channel",
            name,
            topic: action.topic ? String(action.topic).slice(0, 200) : undefined
        };
    }
    if (type === "create_role") {
        const name = String(action.name || "").trim().slice(0, 40);
        if (!name || name === "@everyone") return null;
        return {
            type: "create_role",
            name,
            hoist: Boolean(action.hoist),
            mentionable: Boolean(action.mentionable)
        };
    }
    return null;
}

async function executeActions(guild, actions, user) {
    const results = [];
    const list = Array.isArray(actions) ? actions.slice(0, 10) : [];

    for (const raw of list) {
        const action = sanitizeAction(raw);
        if (!action) {
            results.push({ ok: false, error: "Invalid or disallowed action", action: raw });
            continue;
        }
        try {
            if (action.type === "settings_patch") {
                applyPatch(guild.id, action.patch, user);
                results.push({ ok: true, type: action.type, patch: action.patch });
            } else if (action.type === "create_text_channel") {
                const me = guild.members.me;
                if (me && !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                    results.push({
                        ok: false,
                        type: action.type,
                        error: "Bot lacks Manage Channels permission"
                    });
                    continue;
                }
                const existing = guild.channels.cache.find(
                    (c) =>
                        c.type === ChannelType.GuildText &&
                        c.name === action.name
                );
                if (existing) {
                    results.push({
                        ok: true,
                        type: action.type,
                        skipped: true,
                        channelId: existing.id,
                        name: existing.name
                    });
                    continue;
                }
                const ch = await guild.channels.create({
                    name: action.name,
                    type: ChannelType.GuildText,
                    topic: action.topic || undefined,
                    reason: `OmniBot Growth Advisor (${user?.username || user?.id || "dashboard"})`
                });
                results.push({
                    ok: true,
                    type: action.type,
                    channelId: ch.id,
                    name: ch.name
                });
            } else if (action.type === "create_role") {
                const me = guild.members.me;
                if (me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    results.push({
                        ok: false,
                        type: action.type,
                        error: "Bot lacks Manage Roles permission"
                    });
                    continue;
                }
                const existing = guild.roles.cache.find(
                    (r) => r.name.toLowerCase() === action.name.toLowerCase()
                );
                if (existing) {
                    results.push({
                        ok: true,
                        type: action.type,
                        skipped: true,
                        roleId: existing.id,
                        name: existing.name
                    });
                    continue;
                }
                const role = await guild.roles.create({
                    name: action.name,
                    hoist: action.hoist,
                    mentionable: action.mentionable,
                    reason: `OmniBot Growth Advisor (${user?.username || user?.id || "dashboard"})`
                });
                results.push({
                    ok: true,
                    type: action.type,
                    roleId: role.id,
                    name: role.name
                });
            }
        } catch (e) {
            results.push({
                ok: false,
                type: action.type,
                error: e?.message || String(e)
            });
        }
    }

    return results;
}

module.exports = {
    analyzeGuild,
    executeActions,
    sanitizeAction,
    SAFE_SETTING_KEYS,
    formatAiUserError,
    getRemaining,
    DAILY_LIMIT
};
