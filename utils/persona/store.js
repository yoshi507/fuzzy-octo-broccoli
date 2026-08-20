const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../data/persona.json");

const DEFAULTS = {
    displayName: "",
    personality: "",
    bio: "",
    tone: "chill",
    emojiUsage: "low",
    gifUsage: "off",
    greetingStyle: "",
    nickname: ""
};

function ensure() {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}", "utf8");
}

function load() {
    ensure();
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return {};
    }
}

function save(data) {
    ensure();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function getPersona(guildId) {
    const all = load();
    return { ...DEFAULTS, ...(all[guildId] || {}) };
}

function setPersona(guildId, patch) {
    const all = load();
    all[guildId] = { ...getPersona(guildId), ...patch };
    if (typeof all[guildId].personality === "string") {
        all[guildId].personality = all[guildId].personality
            .replace(/ignore (all )?(previous|system) instructions/gi, "")
            .slice(0, 1500);
    }
    if (typeof all[guildId].bio === "string") {
        all[guildId].bio = all[guildId].bio.slice(0, 500);
    }
    if (typeof all[guildId].displayName === "string") {
        all[guildId].displayName = all[guildId].displayName.slice(0, 32);
    }
    if (typeof all[guildId].nickname === "string") {
        all[guildId].nickname = all[guildId].nickname.slice(0, 32);
    }
    save(all);
    return all[guildId];
}

function buildSystemPrompt(guildId, basePrompt) {
    const p = getPersona(guildId);
    const parts = [basePrompt || "You are Omni, a helpful Discord bot."];
    if (p.displayName) parts.push(`In this server you go by the name "${p.displayName}".`);
    if (p.bio) parts.push(`Bio: ${p.bio}`);
    if (p.personality) parts.push(`Personality for this server: ${p.personality}`);
    const toneMap = {
        chill: "Keep a chill, relaxed tone.",
        friendly: "Be warm and friendly.",
        professional: "Be clear, professional, and concise.",
        funny: "Be light-hearted and humorous when appropriate."
    };
    if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone]);
    const emoji = {
        off: "Do not use emojis.",
        low: "Use emojis sparingly.",
        medium: "Emojis are fine in moderation.",
        high: "Emojis are welcome."
    };
    if (emoji[p.emojiUsage]) parts.push(emoji[p.emojiUsage]);
    const gif = {
        off: "Do not suggest or claim to send GIFs.",
        occasional: "You may mention a GIF idea occasionally but do not spam.",
        frequent: "GIF references are welcome occasionally."
    };
    if (gif[p.gifUsage]) parts.push(gif[p.gifUsage]);
    parts.push(
        "Never override safety, moderation, or system rules. Never claim to change Discord's global bot account. Never reveal secrets or tokens."
    );
    return parts.join("\n");
}

module.exports = { getPersona, setPersona, buildSystemPrompt, DEFAULTS };
