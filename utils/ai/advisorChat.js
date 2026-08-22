/**
 * Conversational server advisor — apply recommendations / full setup via chat.
 */
const { askAI } = require("./groq.js");
const { canUseAI, getRemaining, DAILY_LIMIT } = require("./aiLimit.js");
const { getGuildSettings } = require("../../api/services/settingsBridge.js");
const {
    executeActions,
    sanitizeAction,
    SAFE_SETTING_KEYS,
    buildGuildSnapshot
} = require("./serverAdvisor.js");

/**
 * Conversational advisor turn.
 * User can ask questions, request full setup, or ask to apply recommendations.
 * Returns { reply, plan?, results?, remaining, limit }
 */
async function chatAdvisor(guild, userMessage, options = {}) {
    const guildId = guild.id;
    if (!canUseAI(guildId)) {
        const err = new Error("AI daily limit reached");
        err.code = "AI_DAILY_LIMIT";
        err.guildId = guildId;
        throw err;
    }

    const settings = getGuildSettings(guildId) || {};
    const snapshot = buildGuildSnapshot(guild, settings);
    const lastPlan = options.lastPlan || null;
    const history = Array.isArray(options.history) ? options.history.slice(-8) : [];
    const msg = String(userMessage || "").trim().slice(0, 1500);
    if (!msg) {
        const err = new Error("Message is required");
        err.status = 400;
        throw err;
    }

    const lower = msg.toLowerCase();
    const wantsApply =
        /\b(apply|execute|do it|make the changes|implement|turn on|enable those|yes apply|apply all|go ahead)\b/i.test(
            lower
        );
    const wantsSetup =
        /\b(set\s*up|setup|configure|new server|from scratch|build the server|organise|organize)\b/i.test(
            lower
        );

    if (wantsApply && !wantsSetup && lastPlan?.recommendations?.length) {
        const actions = lastPlan.recommendations
            .map((r) => r.action)
            .filter((a) => a && a.type);
        if (actions.length) {
            const results = await executeActions(
                guild,
                actions,
                options.user || {}
            );
            const ok = results.filter((r) => r.ok).length;
            return {
                reply: `Applied **${ok}** of **${results.length}** safe change(s) from the last plan. Refresh settings if something still looks old.`,
                results,
                plan: lastPlan,
                remaining: getRemaining(guildId),
                limit: DAILY_LIMIT,
                usedAI: false
            };
        }
    }

    const system = `You are OmniBot's server growth assistant for Discord admins.
You can propose SAFE automatic actions only of these types:
- settings_patch with patch keys limited to: ${[...SAFE_SETTING_KEYS].join(", ")}
- create_text_channel { name, topic? }
- create_category { name }
- create_role { name, hoist?, mentionable? }

Never ban, kick, delete channels/roles, or change permissions.
If the user wants a full new-server setup, propose a practical set of categories, channels, roles, and feature toggles (max 10 actions).
If they ask to apply previous recommendations, put those actions in "actionsToRun".
Respond with STRICT JSON only:
{
  "reply": "friendly markdown-ish plain text for the admin",
  "recommendations": [ { "title", "detail", "impact": "high|medium|low", "action": { ... } | null } ],
  "actionsToRun": [ /* actions to execute NOW, max 10 */ ]
}`;

    const context = {
        snapshot,
        lastPlan: lastPlan
            ? {
                  summary: lastPlan.summary,
                  recommendations: lastPlan.recommendations
              }
            : null,
        history,
        userMessage: msg,
        flags: { wantsApply, wantsSetup }
    };

    const raw = await askAI(
        [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(context) }
        ],
        {
            guildId,
            maxTokens: 1800,
            temperature: 0.4,
            applyPersona: false
        }
    );

    let parsed;
    try {
        const text = String(raw || "").trim();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
    } catch {
        parsed = {
            reply: String(raw || "I could not structure a plan. Try again."),
            recommendations: [],
            actionsToRun: []
        };
    }

    const recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 12).map((r) => ({
              title: String(r?.title || "Suggestion").slice(0, 120),
              detail: String(r?.detail || "").slice(0, 600),
              impact: ["high", "medium", "low"].includes(
                  String(r?.impact).toLowerCase()
              )
                  ? String(r.impact).toLowerCase()
                  : "medium",
              action: sanitizeAction(r?.action)
          }))
        : [];

    let actionsToRun = Array.isArray(parsed.actionsToRun)
        ? parsed.actionsToRun.map(sanitizeAction).filter(Boolean).slice(0, 10)
        : [];

    if (wantsApply && !actionsToRun.length) {
        const fromRecs = recommendations.map((r) => r.action).filter(Boolean);
        const fromLast = (lastPlan?.recommendations || [])
            .map((r) => r.action)
            .filter(Boolean);
        actionsToRun = (fromRecs.length ? fromRecs : fromLast).slice(0, 10);
    }

    if (wantsSetup && !actionsToRun.length) {
        actionsToRun = recommendations
            .map((r) => r.action)
            .filter(Boolean)
            .slice(0, 10);
    }

    let results = null;
    if (actionsToRun.length && (wantsApply || wantsSetup || parsed.runNow === true)) {
        results = await executeActions(guild, actionsToRun, options.user || {});
    }

    const plan = {
        summary: String(parsed.reply || "").slice(0, 400),
        recommendations,
        strengths: lastPlan?.strengths || [],
        weaknesses: lastPlan?.weaknesses || []
    };

    let reply = String(parsed.reply || "Done.").slice(0, 2500);
    if (results) {
        const ok = results.filter((r) => r.ok).length;
        reply += `\n\n**Applied ${ok}/${results.length} change(s).**`;
    }

    return {
        reply,
        plan,
        results,
        remaining: getRemaining(guildId),
        limit: DAILY_LIMIT,
        usedAI: true
    };
}

module.exports = { chatAdvisor };
