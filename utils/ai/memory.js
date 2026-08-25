const fs = require("fs");
const path = require("path");
const { safeMkdir, safeWriteFile, isDiskError } = require("../safeFs.js");

const dataDirectory = path.join(__dirname, "../../data");
const memoryFile = path.join(dataDirectory, "ai-memory.json");

/** In-memory fallback when disk writes fail */
let memCache = null;

function ensureStorage() {
    if (!safeMkdir(dataDirectory)) return false;
    if (!fs.existsSync(memoryFile)) {
        return safeWriteFile(memoryFile, "{}");
    }
    return true;
}

function loadMemory() {
    if (memCache) return memCache;
    ensureStorage();
    try {
        if (fs.existsSync(memoryFile)) {
            memCache = JSON.parse(fs.readFileSync(memoryFile, "utf8"));
        } else {
            memCache = {};
        }
    } catch (error) {
        console.error("AI memory load error:", error?.message || error);
        memCache = {};
    }
    if (!memCache || typeof memCache !== "object") memCache = {};
    return memCache;
}

function saveMemory(memory) {
    memCache = memory && typeof memory === "object" ? memory : memCache || {};
    try {
        if (!ensureStorage()) return;
        const ok = safeWriteFile(memoryFile, JSON.stringify(memCache));
        if (!ok) {
            console.error("[AI Memory] disk write failed — keeping conversation in memory only");
        }
    } catch (err) {
        if (isDiskError(err)) {
            console.error("[AI Memory] ENOSPC — in-memory only");
            return;
        }
        console.error("[AI Memory] save failed:", err?.message || err);
    }
}

function getKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function getConversation(guildId, userId) {
    const memory = loadMemory();
    const key = getKey(guildId, userId);
    if (!memory[key]) memory[key] = [];
    return memory[key];
}

function addMessage(guildId, userId, role, content) {
    const memory = loadMemory();
    const key = getKey(guildId, userId);
    if (!memory[key]) memory[key] = [];
    memory[key].push({ role, content, timestamp: Date.now() });
    if (memory[key].length > 12) {
        memory[key] = memory[key].slice(-12);
    }
    saveMemory(memory);
}

function clearConversation(guildId, userId) {
    const memory = loadMemory();
    const key = getKey(guildId, userId);
    delete memory[key];
    saveMemory(memory);
}

module.exports = {
    getConversation,
    addMessage,
    clearConversation
};
