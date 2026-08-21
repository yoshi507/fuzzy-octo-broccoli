/**
 * Log Discord native AutoMod actions that Omni (or the server) triggers.
 */
const { sendModLog } = require("../utils/modLog.js");
const { RULE_NAME } = require("../utils/automod/helpers.js");

module.exports = {
    name: "autoModerationActionExecution",
    async execute(execution, client) {
        try {
            const guild = execution.guild;
            if (!guild) return;

            let label = "Discord AutoMod";
            try {
                if (execution.ruleId) {
                    const rule = await guild.autoModerationRules
                        .fetch(execution.ruleId)
                        .catch(() => null);
                    if (rule?.name) {
                        label =
                            rule.name === RULE_NAME ||
                            rule.name.startsWith("OmniBot")
                                ? "OmniBot + Discord AutoMod"
                                : `Discord AutoMod (${rule.name})`;
                    }
                }
            } catch {
                /* ignore */
            }

            const channelMention = execution.channelId
                ? `<#${execution.channelId}>`
                : "unknown channel";
            const matched =
                execution.matchedContent ||
                execution.matchedKeyword ||
                "—";

            await sendModLog(guild, {
                title: label,
                description: `Action in ${channelMention}`,
                userId: execution.userId || client.user.id,
                moderatorId: client.user.id,
                reason: `Matched: ${String(matched).slice(0, 200)}`
            });
        } catch (err) {
            console.error(
                "[AutoMod] action log failed:",
                err?.message || err
            );
        }
    }
};
