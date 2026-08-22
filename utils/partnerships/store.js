const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = path.join(__dirname, "../../data/partnerships.json");

function ensure() {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(
            file,
            JSON.stringify({ guilds: {}, codes: {}, requests: {} }, null, 2)
        );
    }
}

function load() {
    ensure();
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { guilds: {}, codes: {}, requests: {} };
    }
}

function save(data) {
    ensure();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function defaultGuild() {
    return {
        enabled: true,
        bio: "",
        inviteUrl: null,
        partnerGuildIds: [],
        affiliateCode: null,
        affiliateHits: 0,
        affiliateJoins: 0,
        createdAt: new Date().toISOString()
    };
}

function getGuild(guildId) {
    const data = load();
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = defaultGuild();
        const code = makeCode();
        data.guilds[guildId].affiliateCode = code;
        data.codes[code] = guildId;
        save(data);
    }
    return data.guilds[guildId];
}

function updateGuild(guildId, patch) {
    const data = load();
    const cur = getGuild(guildId);
    data.guilds[guildId] = { ...cur, ...patch };
    save(data);
    return data.guilds[guildId];
}

function makeCode() {
    return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function getOrCreateAffiliateCode(guildId) {
    const g = getGuild(guildId);
    if (g.affiliateCode) return g.affiliateCode;
    const data = load();
    const code = makeCode();
    data.guilds[guildId].affiliateCode = code;
    data.codes[code] = guildId;
    save(data);
    return code;
}

function resolveAffiliateCode(code) {
    const data = load();
    return data.codes[String(code || "").toUpperCase()] || null;
}

function recordAffiliateHit(code) {
    const gid = resolveAffiliateCode(code);
    if (!gid) return null;
    const data = load();
    data.guilds[gid].affiliateHits = (data.guilds[gid].affiliateHits || 0) + 1;
    save(data);
    return gid;
}

function recordAffiliateJoin(code) {
    const gid = resolveAffiliateCode(code);
    if (!gid) return null;
    const data = load();
    data.guilds[gid].affiliateJoins = (data.guilds[gid].affiliateJoins || 0) + 1;
    save(data);
    return gid;
}

function createRequest(fromGuildId, toGuildId, message) {
    const data = load();
    const id = crypto.randomBytes(6).toString("hex");
    data.requests[id] = {
        id,
        fromGuildId: String(fromGuildId),
        toGuildId: String(toGuildId),
        message: String(message || "").slice(0, 500),
        status: "pending",
        createdAt: new Date().toISOString()
    };
    save(data);
    return data.requests[id];
}

function getRequest(id) {
    const data = load();
    return data.requests[id] || null;
}

function listIncoming(guildId) {
    const data = load();
    return Object.values(data.requests).filter(
        (r) => r.toGuildId === String(guildId) && r.status === "pending"
    );
}

function listOutgoing(guildId) {
    const data = load();
    return Object.values(data.requests).filter(
        (r) => r.fromGuildId === String(guildId) && r.status === "pending"
    );
}

function acceptRequest(id) {
    const data = load();
    const req = data.requests[id];
    if (!req || req.status !== "pending") return null;
    req.status = "accepted";
    req.resolvedAt = new Date().toISOString();

    for (const gid of [req.fromGuildId, req.toGuildId]) {
        if (!data.guilds[gid]) data.guilds[gid] = defaultGuild();
        const list = data.guilds[gid].partnerGuildIds || [];
        const other = gid === req.fromGuildId ? req.toGuildId : req.fromGuildId;
        if (!list.includes(other)) list.push(other);
        data.guilds[gid].partnerGuildIds = list;
    }
    save(data);
    return req;
}

function rejectRequest(id) {
    const data = load();
    const req = data.requests[id];
    if (!req || req.status !== "pending") return null;
    req.status = "rejected";
    req.resolvedAt = new Date().toISOString();
    save(data);
    return req;
}

function removePartner(guildId, partnerId) {
    const data = load();
    if (data.guilds[guildId]) {
        data.guilds[guildId].partnerGuildIds = (
            data.guilds[guildId].partnerGuildIds || []
        ).filter((id) => id !== String(partnerId));
    }
    if (data.guilds[partnerId]) {
        data.guilds[partnerId].partnerGuildIds = (
            data.guilds[partnerId].partnerGuildIds || []
        ).filter((id) => id !== String(guildId));
    }
    save(data);
    return getGuild(guildId);
}

function listPartners(guildId) {
    const g = getGuild(guildId);
    return g.partnerGuildIds || [];
}

module.exports = {
    getGuild,
    updateGuild,
    getOrCreateAffiliateCode,
    resolveAffiliateCode,
    recordAffiliateHit,
    recordAffiliateJoin,
    createRequest,
    getRequest,
    listIncoming,
    listOutgoing,
    acceptRequest,
    rejectRequest,
    removePartner,
    listPartners
};
