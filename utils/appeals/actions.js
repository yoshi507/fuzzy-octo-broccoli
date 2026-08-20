const { loadDatabase, saveDatabase } = require("../../database/database.js");
const { sendModLog } = require("../modLog.js");

/**
 * Apply the remedial action when an appeal is accepted.
 * Returns a short human-readable summary of what was done.
 */
async function applyAcceptedAction(guild, appeal, moderatorUser) {
    const type = String(appeal?.type || "ban").toLowerCase();
    const userId = appeal.userId;
    const reason = `Appeal ${appeal.id} accepted` + (moderatorUser ? ` by ${moderatorUser.tag || moderatorUser.username}` : "");

    if (type === "ban") {
        try {
            await guild.bans.fetch(userId);
            await guild.members.unban(userId, reason);
            try {
                await sendModLog(guild, {
                    title: "🔓 Member Unbanned (Appeal)",
                    description: `<@${userId}> was unbanned after appeal **${appeal.id}** was accepted.`,
                    userId,
                    moderatorId: moderatorUser?.id,
                    reason
                });
            } catch { /* optional */ }
            return "User was **unbanned**.";
        } catch (err) {
            if (err?.code === 10026) {
                return "User was not banned (nothing to unban).";
            }
            console.error("[appeals] unban failed:", err?.message || err);
            return "Could not unban automatically — check bot permissions / ban status.";
        }
    }

    if (type === "timeout" || type === "mute") {
        try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return "User is not in the server, so the timeout could not be cleared.";
            }
            if (!member.moderatable) {
                return "Could not clear timeout (member not moderatable by the bot).";
            }
            await member.timeout(null, reason);
            try {
                await sendModLog(guild, {
                    title: "🔊 Timeout Removed (Appeal)",
                    description: `<@${userId}> had their timeout removed after appeal **${appeal.id}** was accepted.`,
                    userId,
                    moderatorId: moderatorUser?.id,
                    reason
                });
            } catch { /* optional */ }
            return "Timeout / mute was **cleared**.";
        } catch (err) {
            console.error("[appeals] timeout clear failed:", err?.message || err);
            return "Could not clear timeout automatically — check bot permissions.";
        }
    }

    if (type === "warn" || type === "warning") {
        try {
            const database = loadDatabase();
            if (!Array.isArray(database.warnings)) database.warnings = [];
            const before = database.warnings.length;
            database.warnings = database.warnings.filter(
                (w) => !(w.guildId === guild.id && w.userId === userId)
            );
            const removed = before - database.warnings.length;
            saveDatabase(database);
            try {
                await sendModLog(guild, {
                    title: "🧹 Warnings Cleared (Appeal)",
                    description: `Cleared **${removed}** warning(s) for <@${userId}> after appeal **${appeal.id}** was accepted.`,
                    userId,
                    moderatorId: moderatorUser?.id,
                    reason
                });
            } catch { /* optional */ }
            return removed > 0
                ? `Cleared **${removed}** warning(s).`
                : "No warnings found to clear.";
        } catch (err) {
            console.error("[appeals] clear warnings failed:", err?.message || err);
            return "Could not clear warnings automatically.";
        }
    }

    return `Appeal type \`${type}\` has no automatic action.`;
}

module.exports = {
    applyAcceptedAction
};
