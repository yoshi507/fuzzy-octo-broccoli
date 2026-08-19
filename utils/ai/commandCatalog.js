/**
 * Catalog of real OmniBot commands for the AI help assistant.
 * Keep this updated when commands change so the AI does not invent features.
 */
const CATALOG = [
    { name: "ask", category: "AI", description: "Ask Omni a one-off AI question (uses the shared daily AI limit)." },
    { name: "chat", category: "AI", description: "Have a multi-turn conversation with Omni (uses memory + daily AI limit)." },
    { name: "aisummary", category: "AI", description: "Summarise recent messages in the current channel." },
    { name: "aihelp", category: "AI", description: "Ask how Omni's commands and features work." },
    { name: "aiassistant", category: "AI", description: "Ask about this server or general Discord topics." },
    { name: "aimoderate", category: "AI", description: "Staff tool: analyse a message for moderation context (no auto-punish)." },
    { name: "aiincident", category: "AI", description: "Staff tool: explain recorded security incidents." },
    { name: "aisecurity", category: "AI/Security", description: "Enable/disable AI security, set mode, view status, optional executor timeout." },
    { name: "clearmemory", category: "AI", description: "Clear your personal Omni chat memory." },
    { name: "ping", category: "Utility", description: "Check bot latency." },
    { name: "help", category: "Utility", description: "Static list of command categories." },
    { name: "serverinfo", category: "Utility", description: "Show server information." },
    { name: "userinfo", category: "Utility", description: "Show user information." },
    { name: "ban", category: "Moderation", description: "Ban a member." },
    { name: "kick", category: "Moderation", description: "Kick a member." },
    { name: "timeout", category: "Moderation", description: "Timeout a member." },
    { name: "warn", category: "Moderation", description: "Warn a member." },
    { name: "warnings", category: "Moderation", description: "View a member's warnings." },
    { name: "clearwarnings", category: "Moderation", description: "Clear a member's warnings." },
    { name: "modlogs", category: "Moderation", description: "Configure moderation log channel." },
    { name: "modhistory", category: "Moderation", description: "View moderation history." },
    { name: "clear", category: "Moderation", description: "Bulk delete messages." },
    { name: "lock", category: "Moderation", description: "Lock a channel." },
    { name: "unlock", category: "Moderation", description: "Unlock a channel." },
    { name: "slowmode", category: "Moderation", description: "Set channel slowmode." },
    { name: "automod", category: "Moderation", description: "Configure keyword-based automod (non-AI)." },
    { name: "rank", category: "Leveling", description: "Show your level and XP." },
    { name: "leaderboard", category: "Leveling", description: "Show the XP leaderboard." },
    { name: "levelsettings", category: "Leveling", description: "Configure leveling." },
    { name: "levelrole", category: "Leveling", description: "Configure level reward roles." },
    { name: "play", category: "Music", description: "Play music in a voice channel." },
    { name: "skip", category: "Music", description: "Skip the current track." },
    { name: "stop", category: "Music", description: "Stop playback." },
    { name: "queue", category: "Music", description: "Show the music queue." },
    { name: "pause", category: "Music", description: "Pause playback." },
    { name: "resume", category: "Music", description: "Resume playback." },
    { name: "volume", category: "Music", description: "Change volume." },
    { name: "nowplaying", category: "Music", description: "Show the current track." },
    { name: "lyrics", category: "Music", description: "Fetch lyrics for the current track." },
    { name: "welcome", category: "Server", description: "Configure welcome messages." },
    { name: "goodbye", category: "Server", description: "Configure goodbye messages." },
    { name: "autorole", category: "Server", description: "Configure auto-role for new members." },
    { name: "logging", category: "Server", description: "Configure server logging." },
    { name: "deadchat", category: "Server", description: "Configure dead-chat revival prompts (non-AI questions)." },
    { name: "suggest", category: "Server", description: "Submit a suggestion." },
    { name: "poll", category: "Server", description: "Create a poll." },
    { name: "announce", category: "Server", description: "Send an announcement." },
    { name: "ticketsetup", category: "Tickets", description: "Set up the ticket system." },
    { name: "ticketstaff", category: "Tickets", description: "Configure ticket staff roles." },
    { name: "translate", category: "Utility", description: "Translate text (non-AI path planned; may still use AI until converted)." },
    { name: "autotranslate", category: "Utility", description: "Auto-translate channel messages (planned non-AI)." }
];

function getCatalogText() {
    const byCategory = {};
    for (const cmd of CATALOG) {
        if (!byCategory[cmd.category]) {
            byCategory[cmd.category] = [];
        }
        byCategory[cmd.category].push(`/${cmd.name} — ${cmd.description}`);
    }

    return Object.entries(byCategory)
        .map(([cat, lines]) => `## ${cat}\n${lines.join("\n")}`)
        .join("\n\n");
}

function getCommandNames() {
    return CATALOG.map(c => c.name);
}

module.exports = {
    CATALOG,
    getCatalogText,
    getCommandNames
};
