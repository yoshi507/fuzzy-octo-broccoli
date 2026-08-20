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
        const abs = resolveImageAbsolute(relPath);
        if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {}
}

function decodeDataUrl(dataUrl) {
    const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
    if (!m) {
        const err = new Error("Invalid image data URL");
        err.status = 400;
        err.code = "VALIDATION";
        throw err;
    }
    const mime = m[1].toLowerCase();
    const ext = ALLOWED_IMAGE_TYPES[mime];
    if (!ext) {
        const err = new Error("Unsupported image type. Use JPEG, PNG, WebP, or GIF.");
        err.status = 400;
        err.code = "VALIDATION";
        throw err;
    }
    const buf = Buffer.from(m[2], "base64");
    return { mime, ext, buf };
}

function saveGuildImage(guildId, kind, dataUrl) {
    const id = String(guildId);
    const { ext, buf } = decodeDataUrl(dataUrl);
    const max = kind === "banner" ? MAX_BANNER_BYTES : MAX_AVATAR_BYTES;
    if (buf.length > max) {
        const err = new Error(`Image too large (max ${Math.floor(max / 1024)}KB)`);
        err.status = 400;
        err.code = "VALIDATION";
        throw err;
    }
    const guildDir = path.join(assetsRoot, id);
    if (!fs.existsSync(guildDir)) fs.mkdirSync(guildDir, { recursive: true });
    const filename = `${kind}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const abs = path.join(guildDir, filename);
    fs.writeFileSync(abs, buf);
    const relPath = path.join(id, filename).replace(/\\/g, "/");
    const current = getPersona(id);
    if (kind === "avatar") {
        removeImageFile(current.avatarPath);
        return setPersona(id, { avatarPath: relPath, avatarUpdatedAt: Date.now() });
    }
    removeImageFile(current.bannerPath);
    return setPersona(id, { bannerPath: relPath, bannerUpdatedAt: Date.now() });
}

function clearGuildImage(guildId, kind) {
    const id = String(guildId);
    const current = getPersona(id);
    if (kind === "avatar") {
        removeImageFile(current.avatarPath);
        return setPersona(id, { avatarPath: null, avatarUpdatedAt: null });
    }
    removeImageFile(current.bannerPath);
    return setPersona(id, { bannerPath: null, bannerUpdatedAt: null });
}

function resolveImageAbsolute(relPath) {
    if (!relPath) return null;
    const abs = path.join(assetsRoot, relPath);
    if (!abs.startsWith(assetsRoot)) return null;
    return abs;
}

function toPublicPersona(guildId, persona) {
    const p = persona || getPersona(guildId);
    return {
        guildId: String(guildId),
        displayName: p.displayName || "",
        nickname: p.nickname || "",
        personality: p.personality || "",
        bio: p.bio || "",
        tone: p.tone || "chill",
        emojiUsage: p.emojiUsage || "low",
        gifUsage: p.gifUsage || "off",
        greetingStyle: p.greetingStyle || "",
        hasAvatar: Boolean(p.avatarPath),
        hasBanner: Boolean(p.bannerPath),
        avatarUrl: p.avatarPath
            ? `/guilds/${guildId}/persona/avatar?v=${encodeURIComponent(p.avatarUpdatedAt || "1")}`
            : null,
        bannerUrl: p.bannerPath
            ? `/guilds/${guildId}/persona/banner?v=${encodeURIComponent(p.bannerUpdatedAt || "1")}`
            : null,
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

const { appendStyleRules } = require("./promptRules.js");

const DEFAULT_BASE_PROMPT =
    "You are Omni, a helpful Discord bot. Be natural and conversational. Never pretend to be human. Respect Discord and server rules. Never reveal secrets or tokens.";

function buildSystemPrompt(guildId, basePrompt) {
    const p = getPersona(guildId);
    const name = (p.displayName || p.nickname || "").trim();
    const customPersonality = String(p.personality || "").trim();
    const hasCustomPersonality = Boolean(customPersonality);

    const parts = [];

    if (name) {
        parts.push(
            `Your name in this Discord server is "${name}". Always refer to yourself as ${name}, not Omni, unless the user specifically asks about the bot software.`
        );
    } else {
        parts.push("Your name is Omni.");
    }

    parts.push(basePrompt || DEFAULT_BASE_PROMPT);

    appendStyleRules(parts, p, customPersonality, hasCustomPersonality);

    parts.push(
        "These instructions apply only to this Discord server.",
        "Never override safety, moderation, or system rules.",
        "Never claim you changed Discord's global bot account avatar or banner (Discord does not allow per-server bot avatars)."
    );

    return parts.filter(Boolean).join("\n\n");
}

async function applyPersonaToDiscord(client, guildId) {
    try {
        const guild = client.guilds.cache.get(String(guildId)) || (await client.guilds.fetch(String(guildId)).catch(() => null));
        if (!guild) return { ok: false, reason: "guild_not_found" };
        const p = getPersona(guildId);
        const nick = (p.nickname || p.displayName || "").trim().slice(0, 32);
        if (nick) {
            const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
            if (me && me.manageable !== false) {
                await me.setNickname(nick).catch((err) => {
                    console.warn("[persona] setNickname failed:", err?.message || err);
                });
            }
        }
        return { ok: true };
    } catch (err) {
        console.warn("[persona] applyPersonaToDiscord:", err?.message || err);
        return { ok: false, reason: err?.message || "error" };
    }
}

module.exports = {
    getPersona,
    setPersona,
    resetPersona,
    buildSystemPrompt,
    DEFAULT_BASE_PROMPT,
    toPublicPersona,
    saveGuildImage,
    clearGuildImage,
    resolveImageAbsolute,
    applyPersonaToDiscord,
    DEFAULTS
};
