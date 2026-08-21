const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "../../data");
const file = path.join(dataDir, "advertise.json");

const CATEGORIES = [
    { id: "gaming", label: "Gaming" },
    { id: "community", label: "Community" },
    { id: "social", label: "Social" },
    { id: "economy", label: "Economy / Farming" },
    { id: "roleplay", label: "Roleplay" },
    { id: "education", label: "Education / Study" },
    { id: "anime", label: "Anime / Media" },
    { id: "music", label: "Music" },
    { id: "tech", label: "Tech / Coding" },
    { id: "other", label: "Other" }
];

function ensure() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ guilds: {} }, null, 2), "utf8");
    }
}

function load() {
    ensure();
    try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!data.guilds || typeof data.guilds !== "object") data.guilds = {};
        return data;
    } catch {
        return { guilds: {} };
    }
}

function save(data) {
    ensure();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function normalizeCategory(raw) {
    const id = String(raw || "other").toLowerCase().trim();
    return CATEGORIES.some((c) => c.id === id) ? id : "other";
}

function getListing(guildId) {
    const data = load();
    return data.guilds[String(guildId)] || null;
}

function upsertListing(guildId, patch) {
    const data = load();
    const id = String(guildId);
    const prev = data.guilds[id] || {};
    const now = new Date().toISOString();
    const next = {
        guildId: id,
        name: String(patch.name || prev.name || "Unknown Server").slice(0, 100),
        icon: patch.icon !== undefined ? patch.icon : prev.icon || null,
        memberCount:
            patch.memberCount != null
                ? Number(patch.memberCount) || 0
                : prev.memberCount || 0,
        description: String(
            patch.description !== undefined ? patch.description : prev.description || ""
        ).slice(0, 300),
        category: normalizeCategory(
            patch.category !== undefined ? patch.category : prev.category
        ),
        inviteUrl: String(
            patch.inviteUrl !== undefined ? patch.inviteUrl : prev.inviteUrl || ""
        ).slice(0, 200),
        listedAt: prev.listedAt || now,
        updatedAt: now,
        listedBy: String(patch.listedBy || prev.listedBy || "")
    };
    data.guilds[id] = next;
    save(data);
    return next;
}

function removeListing(guildId) {
    const data = load();
    const id = String(guildId);
    if (!data.guilds[id]) return false;
    delete data.guilds[id];
    save(data);
    return true;
}

function listDirectory({ category = null, search = "" } = {}) {
    const data = load();
    let rows = Object.values(data.guilds || {});
    if (category && category !== "all") {
        const cat = normalizeCategory(category);
        rows = rows.filter((r) => r.category === cat);
    }
    const q = String(search || "").toLowerCase().trim();
    if (q) {
        rows = rows.filter(
            (r) =>
                String(r.name || "").toLowerCase().includes(q) ||
                String(r.description || "").toLowerCase().includes(q)
        );
    }
    rows.sort((a, b) => {
        const mc = (b.memberCount || 0) - (a.memberCount || 0);
        if (mc !== 0) return mc;
        return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return rows;
}

function groupByCategory(rows) {
    const map = {};
    for (const c of CATEGORIES) map[c.id] = [];
    for (const row of rows) {
        const cat = normalizeCategory(row.category);
        if (!map[cat]) map[cat] = [];
        map[cat].push(row);
    }
    return map;
}

module.exports = {
    CATEGORIES,
    normalizeCategory,
    getListing,
    upsertListing,
    removeListing,
    listDirectory,
    groupByCategory
};
