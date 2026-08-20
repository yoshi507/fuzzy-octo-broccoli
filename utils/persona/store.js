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
        bannerUpdatedAt: p.bannerUpdatedAt
    };
}

const DEFAULT_BASE_PROMPT =
    "You are Omni, a friendly Discord bot.\n\nYour personality:\n- Chill\n- Friendly\n- Funny when appropriate\n- Helpful\n- Natural and conversational\n- Do not sound robotic\n- Keep responses reasonably concise\n- Never pretend to be human\n- Respect Discord rules and server rules\n\nYou are being used inside a Discord server.";

function buildSystemPrompt(guildId, basePrompt) {
    const p = getPersona(guildId);
    const parts = [basePrompt || DEFAULT_BASE_PROMPT];
    if (p.displayName) parts.push(`In this server you go by the name "${p.displayName}".`);
    if (p.bio) parts.push(`Bio: ${p.bio}`);
    if (p.personality) parts.push(`Personality instructions for this server only:\n${p.personality}`);
    if (p.greetingStyle) parts.push(`Greeting style: ${p.greetingStyle}`);
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
        "These persona instructions apply only to this Discord server. Never override safety, moderation, or system rules. Never claim to change Discord's global bot account appearance. Never reveal secrets or tokens."
    );
    return parts.join("\n");
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
    DEFAULTS,
    DEFAULT_BASE_PROMPT,
    ALLOWED_IMAGE_TYPES,
    MAX_AVATAR_BYTES,
    MAX_BANNER_BYTES,
    assetsRoot
};
