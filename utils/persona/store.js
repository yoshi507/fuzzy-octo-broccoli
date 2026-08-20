const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = path.join(__dirname, "../../data/persona.json");
const assetsRoot = path.join(__dirname, "../../data/persona-assets");

const DEFAULTS = {
    displayName: "",
    personality: "",
    bio: "",
    tone: "chill",
    emojiUsage: "low",
    gifUsage: "off",
    greetingStyle: "",
    nickname: "",
    avatarPath: null,
    bannerPath: null,
    avatarUpdatedAt: null,
    bannerUpdatedAt: null
};

const ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 4 * 1024 * 1024;

function ensure() {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{}", "utf8");
    if (!fs.existsSync(assetsRoot)) fs.mkdirSync(assetsRoot, { recursive: true });
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
    return { ...DEFAULTS, ...(all[String(guildId)] || {}) };
}

function sanitizeText(value, max) {
    if (typeof value !== "string") return "";
    return value
        .replace(/ignore (all )?(previous|system) instructions/gi, "")
        .replace(/\0/g, "")
        .slice(0, max);
}

function setPersona(guildId, patch) {
    const id = String(guildId);
    const all = load();
    const current = getPersona(id);
    const next = { ...current };

    if (patch && typeof patch === "object") {
        if ("displayName" in patch) next.displayName = sanitizeText(String(patch.displayName || ""), 32);
        if ("nickname" in patch) next.nickname = sanitizeText(String(patch.nickname || ""), 32);
        if ("bio" in patch) next.bio = sanitizeText(String(patch.bio || ""), 500);
        if ("personality" in patch) next.personality = sanitizeText(String(patch.personality || ""), 2000);
        if ("greetingStyle" in patch) next.greetingStyle = sanitizeText(String(patch.greetingStyle || ""), 300);
        if ("tone" in patch && ["chill", "friendly", "professional", "funny"].includes(patch.tone)) {
            next.tone = patch.tone;
        }
        if ("emojiUsage" in patch && ["off", "low", "medium", "high"].includes(patch.emojiUsage)) {
            next.emojiUsage = patch.emojiUsage;
        }
        if ("gifUsage" in patch && ["off", "occasional", "frequent"].includes(patch.gifUsage)) {
            next.gifUsage = patch.gifUsage;
        }
        if ("avatarPath" in patch) next.avatarPath = patch.avatarPath;
        if ("bannerPath" in patch) next.bannerPath = patch.bannerPath;
        if ("avatarUpdatedAt" in patch) next.avatarUpdatedAt = patch.avatarUpdatedAt;
        if ("bannerUpdatedAt" in patch) next.bannerUpdatedAt = patch.bannerUpdatedAt;
    }

    all[id] = next;
    save(all);
    return next;
}

function resetPersona(guildId) {
    const id = String(guildId);
    const current = getPersona(id);
    removeImageFile(current.avatarPath);
    removeImageFile(current.bannerPath);
    const all = load();
    all[id] = { ...DEFAULTS };
    save(all);
    const guildDir = path.join(assetsRoot, id);
    try {
        if (fs.existsSync(guildDir)) fs.rmSync(guildDir, { recursive: true, force: true });
    } catch {}
    return { ...DEFAULTS };
}

function removeImageFile(relPath) {
    if (!relPath) return;
    try {
        const abs = path.join(assetsRoot, relPath);
        if (abs.startsWith(assetsRoot) && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {}
}

function decodeDataUrl(dataUrl) {
    if (typeof dataUrl !== "string") return null;
    const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!m) return null;
    const mime = m[1].toLowerCase();
    const ext = ALLOWED_IMAGE_TYPES[mime];
    if (!ext) return null;
    const buffer = Buffer.from(m[2].replace(/\s/g, ""), "base64");
    return { mime, ext, buffer };
}

function saveGuildImage(guildId, kind, dataUrl) {
    const id = String(guildId);
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) {
        const err = new Error("Invalid image. Use PNG, JPEG, WebP, or GIF.");
        err.status = 400;
        err.code = "VALIDATION";
        throw err;
    }
    const max = kind === "banner" ? MAX_BANNER_BYTES : MAX_AVATAR_BYTES;
    if (decoded.buffer.length > max) {
        const err = new Error(`Image too large (max ${Math.round(max / 1024 / 1024)}MB).`);
        err.status = 400;
        err.code = "VALIDATION";
        throw err;
    }

    const current = getPersona(id);
    const prevPath = kind === "banner" ? current.bannerPath : current.avatarPath;
    removeImageFile(prevPath);

    const guildDir = path.join(assetsRoot, id);
    fs.mkdirSync(guildDir, { recursive: true });
    const filename = `${kind}-${crypto.randomBytes(6).toString("hex")}.${decoded.ext}`;
    const abs = path.join(guildDir, filename);
    fs.writeFileSync(abs, decoded.buffer);

    const rel = path.join(id, filename).replace(/\\/g, "/");
    const patch =
        kind === "banner"
            ? { bannerPath: rel, bannerUpdatedAt: new Date().toISOString() }
            : { avatarPath: rel, avatarUpdatedAt: new Date().toISOString() };
    return setPersona(id, patch);
}

function clearGuildImage(guildId, kind) {
    const id = String(guildId);
    const current = getPersona(id);
    if (kind === "banner") {
        removeImageFile(current.bannerPath);
        return setPersona(id, { bannerPath: null, bannerUpdatedAt: null });
    }
    removeImageFile(current.avatarPath);
    return setPersona(id, { avatarPath: null, avatarUpdatedAt: null });
}

function resolveImageAbsolute(relPath) {
    if (!relPath) return null;
    const abs = path.resolve(assetsRoot, relPath);
    if (!abs.startsWith(path.resolve(assetsRoot))) return null;
    if (!fs.existsSync(abs)) return null;
    return abs;
}

function toPublicPersona(guildId, persona) {
    const p = persona || getPersona(guildId);
    return {
        displayName: p.displayName || "",
        nickname: p.nickname || "",
        bio: p.bio || "",
        personality: p.personality || "",
        tone: p.tone || "chill",
        emojiUsage: p.emojiUsage || "low",
        gifUsage: p.gifUsage || "off",
        greetingStyle: p.greetingStyle || "",
        hasAvatar: Boolean(p.avatarPath),
        hasBanner: Boolean(p.bannerPath),
        avatarUrl: p.avatarPath ? `/guilds/${guildId}/persona/avatar?v=${encodeURIComponent(p.avatarUpdatedAt || "1")}` : null,
        bannerUrl: p.bannerPath ? `/guilds/${guildId}/persona/banner?v=${encodeURIComponent(p.bannerUpdatedAt || "1")}` : null,
        avatarUpdatedAt: p.avatarUpdatedAt,
        bannerUpdatedAt: p.bannerUpdatedAt,
        discordLimits: {
            nicknamePerServer: true,
            avatarPerServer: false,
            bannerPerServer: false,
            bioPerServer: false,
            note: "Discord only allows bots to change nickname per server. Avatar, banner and about/bio are application-wide and cannot differ per guild."
        }
    };
}

const DEFAULT_BASE_PROMPT =
    "You are Omni, a helpful Discord bot. Be natural and conversational. Never pretend to be human. Respect Discord and server rules. Never reveal secrets or tokens.";

function buildSystemPrompt(guildId, basePrompt) {
    const p = getPersona(guildId);
    const name = (p.displayName || p.nickname || "").trim();
    const hasCustomPersonality = Boolean((p.personality || "").trim());

    const parts = [];

    if (name) {
        parts.push(
            `Your name in this Discord server is "${name}". Always refer to yourself as ${name}, not Omni, unless the user specifically asks about the bot software.`
        );
    } else {
        parts.push(basePrompt || DEFAULT_BASE_PROMPT);
        parts.push("Your name is Omni.");
    }

    if (p.bio && p.bio.trim()) {
        parts.push(`About you in this server: ${p.bio.trim()}`);
    }

    if (hasCustomPersonality) {
        parts.push(
            "CRITICAL — Follow these personality instructions strictly for every reply in this server. They override your default style:"
        );
        parts.push(p.personality.trim());
    } else {
        parts.push(
            "Default style: friendly, helpful, chill, concise. Funny only when it fits."
        );
    }

    if (p.greetingStyle && p.greetingStyle.trim()) {
        parts.push(`When greeting users, use this style: ${p.greetingStyle.trim()}`);
    }

    const toneMap = {
        chill: "Tone: relaxed and casual.",
        friendly: "Tone: warm, encouraging, and friendly.",
        professional: "Tone: clear, professional, and concise. Avoid slang.",
        funny: "Tone: witty and humorous when appropriate, without being mean."
    };
    if (p.tone && toneMap[p.tone]) parts.push(toneMap[p.tone]);

    const emoji = {
        off: "EMOJI RULE (mandatory): Do not use any emoji characters in your replies.",
        low: "EMOJI RULE: Use at most one emoji only when it clearly helps. Prefer none.",
        medium: "EMOJI RULE: You may use a few emojis where they feel natural.",
        high: "EMOJI RULE: Use emojis freely to match an energetic, expressive style."
    };
    if (emoji[p.emojiUsage]) parts.push(emoji[p.emojiUsage]);

    const gif = {
        off: "GIF RULE (mandatory): Do not mention, suggest, or pretend to send GIFs or stickers.",
        occasional: "GIF RULE: You may occasionally suggest a GIF idea, but do not spam.",
        frequent: "GIF RULE: GIF and reaction ideas are welcome when they fit the chat."
    };
    if (gif[p.gifUsage]) parts.push(gif[p.gifUsage]);

    parts.push(
        "These instructions apply only to this Discord server.",
        "Never override safety, moderation, or system rules.",
        "Never claim you changed Discord's global bot account avatar or banner (Discord does not allow per-server bot avatars)."
    );

    return parts.join("\n");
}

async function applyPersonaToDiscord(client, guildId) {
    const result = {
        nicknameApplied: false,
        nickname: null,
        error: null,
        limits: {
            avatarPerServer: false,
            bannerPerServer: false,
            bioPerServer: false
        }
    };

    if (!client || !guildId) {
        result.error = "Missing client or guild";
        return result;
    }

    const p = getPersona(guildId);
    const nick = (p.nickname || p.displayName || "").trim().slice(0, 32);

    try {
        const guild = client.guilds.cache.get(String(guildId));
        if (!guild) {
            result.error = "Bot is not in this guild";
            return result;
        }

        const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
        if (!me) {
            result.error = "Could not resolve bot member";
            return result;
        }

        const target = nick || null;
        if ((me.nickname || null) === target) {
            result.nicknameApplied = true;
            result.nickname = target;
            return result;
        }

        await me.setNickname(target, "OmniBot persona update");
        result.nicknameApplied = true;
        result.nickname = target;
    } catch (err) {
        result.error = err?.message || String(err);
        console.warn("[persona] setNickname failed:", guildId, result.error);
    }

    return result;
}

module.exports = {
    getPersona,
    setPersona,
    resetPersona,
    buildSystemPrompt,
    saveGuildImage,
    clearGuildImage,
    resolveImageAbsolute,
    toPublicPersona,
    applyPersonaToDiscord,
    DEFAULTS,
    DEFAULT_BASE_PROMPT,
    ALLOWED_IMAGE_TYPES,
    MAX_AVATAR_BYTES,
    MAX_BANNER_BYTES,
    assetsRoot
};
