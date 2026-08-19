const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../../data/appeals.json");

function ensure() {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ guilds: {}, sequences: {} }, null, 2));
    }
}

function load() {
    ensure();
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { guilds: {}, sequences: {} };
    }
}

function save(data) {
    ensure();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const DEFAULT_QUESTIONS = [
    { id: "reason_given", label: "What reason were you given for the action?", required: true },
    { id: "why_unfair", label: "Why do you believe the punishment should be reconsidered?", required: true },
    { id: "what_changed", label: "What would you do differently going forward?", required: true },
    { id: "extra", label: "Anything else the staff should know?", required: false }
];

function defaultSettings() {
    return {
        enabled: false,
        channelId: null,
        staffRoleIds: [],
        category: "ban",
        cooldownHours: 72,
        acceptMessage: "Your appeal has been **accepted**. A staff member will follow up if needed.",
        rejectMessage: "Your appeal has been **rejected**. You may appeal again after the cooldown period.",
        pendingMessage: "Your appeal was submitted and is awaiting review.",
        moreInfoMessage: "Staff have requested more information on your appeal. Please reply with details.",
        embedColor: 0x5865f2,
        questions: DEFAULT_QUESTIONS.map((q) => ({ ...q })),
        logEnabled: true
    };
}

function getSettings(guildId) {
    const data = load();
    const raw = data.guilds[guildId]?.settings;
    const base = defaultSettings();
    if (!raw) return base;
    return {
        ...base,
        ...raw,
        questions: Array.isArray(raw.questions) && raw.questions.length ? raw.questions : base.questions,
        staffRoleIds: Array.isArray(raw.staffRoleIds) ? raw.staffRoleIds : []
    };
}

function setSettings(guildId, patch) {
    const data = load();
    if (!data.guilds[guildId]) data.guilds[guildId] = { settings: defaultSettings(), appeals: {} };
    data.guilds[guildId].settings = { ...getSettings(guildId), ...patch };
    save(data);
    return data.guilds[guildId].settings;
}

function nextId(guildId) {
    const data = load();
    if (!data.sequences) data.sequences = {};
    data.sequences[guildId] = (data.sequences[guildId] || 1000) + 1;
    save(data);
    return `APL-${data.sequences[guildId]}`;
}

function listAppeals(guildId) {
    const data = load();
    const map = data.guilds[guildId]?.appeals || {};
    return Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function getAppeal(guildId, appealId) {
    const data = load();
    return data.guilds[guildId]?.appeals?.[appealId] || null;
}

function findOpenByUser(guildId, userId) {
    return listAppeals(guildId).find(
        (a) => a.userId === userId && (a.status === "pending" || a.status === "more_info")
    );
}

function createAppeal(guildId, payload) {
    const id = nextId(guildId);
    const data2 = load();
    if (!data2.guilds[guildId]) data2.guilds[guildId] = { settings: defaultSettings(), appeals: {} };
    if (!data2.guilds[guildId].appeals) data2.guilds[guildId].appeals = {};
    const appeal = {
        id,
        guildId,
        userId: payload.userId,
        username: payload.username,
        type: payload.type || "ban",
        answers: payload.answers || {},
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        staffNote: null,
        reviewedBy: null,
        messageId: null,
        channelId: null
    };
    data2.guilds[guildId].appeals[id] = appeal;
    save(data2);
    return appeal;
}

function updateAppeal(guildId, appealId, patch) {
    const data = load();
    const appeal = data.guilds[guildId]?.appeals?.[appealId];
    if (!appeal) return null;
    Object.assign(appeal, patch, { updatedAt: Date.now() });
    data.guilds[guildId].appeals[appealId] = appeal;
    save(data);
    return appeal;
}

function lastClosedAt(guildId, userId) {
    const closed = listAppeals(guildId).filter(
        (a) => a.userId === userId && (a.status === "accepted" || a.status === "rejected")
    );
    if (!closed.length) return 0;
    return Math.max(...closed.map((a) => a.updatedAt || a.createdAt || 0));
}

module.exports = {
    DEFAULT_QUESTIONS,
    defaultSettings,
    getSettings,
    setSettings,
    listAppeals,
    getAppeal,
    findOpenByUser,
    createAppeal,
    updateAppeal,
    lastClosedAt
};
