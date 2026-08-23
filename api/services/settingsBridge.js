const { loadDatabase, saveDatabase } = require('../../database/database.js');
const {
  getGuildSecurity,
  setGuildSecurity
} = require('../../utils/ai/security.js');
const { SETTINGS, getDefaults, getSettingById, validateSetting } = require('../config/settingsRegistry');
const fs = require('fs');
const path = require('path');

const historyFile = path.join(__dirname, '../../data/settings-history.json');

function ensureHistory() {
  const dir = path.dirname(historyFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(historyFile)) fs.writeFileSync(historyFile, '{}', 'utf8');
}

function loadHistory() {
  ensureHistory();
  try {
    return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveHistory(data) {
  ensureHistory();
  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf8');
}

function ensureGuildObj(db, key, guildId) {
  if (!db[key]) db[key] = {};
  if (!db[key][guildId]) db[key][guildId] = {};
  return db[key][guildId];
}

function syncDeadChatToBotStore(guildId) {
  const db = loadDatabase();
  const dc = db.dashboard?.[guildId]?.deadChat || {};
  const channelId = dc.channelId;
  if (!channelId) return;
  try {
    const { getSettings, setSettings, disable } = require('../../utils/ai/deadChat.js');
    if (!dc.enabled) {
      disable(channelId);
      return;
    }
    const prev = getSettings(channelId) || {};
    setSettings(channelId, {
      ...prev,
      enabled: true,
      minutes: Number(dc.minutes) > 0 ? Number(dc.minutes) : 30,
      lastRevival: prev.lastRevival || 0,
      guildId: String(guildId)
    });
  } catch (err) {
    console.warn('[settingsBridge] deadChat sync failed:', err?.message || err);
  }
}

function readPath(guildId, storagePath) {
  const parts = storagePath.split('.');
  const root = parts[0];
  const db = loadDatabase();

  if (root === 'appeals') {
    try {
      const { getSettings } = require('../../utils/appeals/store.js');
      let node = getSettings(guildId);
      for (let i = 1; i < parts.length; i++) {
        if (node == null) return undefined;
        node = node[parts[i]];
      }
      return node;
    } catch {
      return undefined;
    }
  }

  if (root === 'security') {
    const sec = getGuildSecurity(guildId);
    let node = sec;
    for (let i = 1; i < parts.length; i++) {
      if (node == null) return undefined;
      node = node[parts[i]];
    }
    if (parts[1] === 'antiNuke' && parts[2] === 'windowMs') {
      const ms = Number(node);
      if (Number.isFinite(ms)) return Math.round(ms / 1000);
    }
    return node;
  }

  if (root === 'deadChat') {
    const node = db.dashboard?.[guildId]?.deadChat || {};
    if (parts.length === 1) return node;
    if (parts[1] === 'enabled') return Boolean(node.enabled);
    if (parts[1] === 'minutes') return node.minutes ?? 30;
    if (parts[1] === 'channelId') return node.channelId || null;
    return undefined;
  }

  let node = db[root]?.[guildId];
  if (node == null) return undefined;
  for (let i = 1; i < parts.length; i++) {
    if (node == null) return undefined;
    node = node[parts[i]];
  }
  return node;
}

function writePath(guildId, storagePath, value) {
  const parts = storagePath.split('.');
  const root = parts[0];
  const db = loadDatabase();

  if (root === 'security') {
    const sec = getGuildSecurity(guildId);
    const clone = JSON.parse(JSON.stringify(sec));
    let node = clone;
    for (let i = 1; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    let val = value;
    if (parts[parts.length - 1] === 'windowMs' && Number.isFinite(Number(value))) {
      val = Math.max(5, Number(value)) * 1000;
    }
    node[parts[parts.length - 1]] = val;
    setGuildSecurity(guildId, clone);
    return;
  }

  if (root === 'deadChat') {
    if (!db.dashboard) db.dashboard = {};
    if (!db.dashboard[guildId]) db.dashboard[guildId] = {};
    if (!db.dashboard[guildId].deadChat) db.dashboard[guildId].deadChat = {};
    if (parts[1] === 'enabled') db.dashboard[guildId].deadChat.enabled = Boolean(value);
    if (parts[1] === 'minutes') db.dashboard[guildId].deadChat.minutes = Number(value);
    if (parts[1] === 'channelId') db.dashboard[guildId].deadChat.channelId = value || null;
    saveDatabase(db);
    syncDeadChatToBotStore(guildId);
    return;
  }

  if (root === 'automod') {
    if (!db.automod) db.automod = {};
    if (!db.automod[guildId]) db.automod[guildId] = { enabled: false, blockedWords: [] };
    if (parts[1] === 'enabled') db.automod[guildId].enabled = Boolean(value);
    if (parts[1] === 'blockedWords') {
      if (Array.isArray(value)) db.automod[guildId].blockedWords = value;
      else db.automod[guildId].blockedWords = String(value || '');
    }
    saveDatabase(db);
    return;
  }

  if (!db[root]) db[root] = {};
  if (!db[root][guildId]) db[root][guildId] = {};
  let node = db[root][guildId];
  for (let i = 1; i < parts.length - 1; i++) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  saveDatabase(db);
}

function getGuildSettings(guildId) {
  const out = getDefaults();
  for (const setting of SETTINGS) {
    const val = readPath(guildId, setting.path);
    if (val !== undefined) out[setting.id] = val;
  }
  return out;
}

function applyPatch(guildId, patch, user) {
  const applied = {};
  const errors = [];
  for (const [id, value] of Object.entries(patch || {})) {
    const setting = getSettingById(id);
    if (!setting) continue;
    const result = validateSetting(setting, value);
    if (!result || result.ok === false) {
      errors.push({ id, error: result?.error || 'Invalid value' });
      continue;
    }
    writePath(guildId, setting.path, result.value);
    applied[id] = result.value;
  }
  if (errors.length && !Object.keys(applied).length) {
    const err = new Error(errors.map((e) => e.id + ': ' + e.error).join('; '));
    err.status = 400;
    err.code = 'VALIDATION';
    err.errors = errors;
    throw err;
  }

  const hist = loadHistory();
  if (!hist[guildId]) hist[guildId] = [];
  hist[guildId].unshift({
    id: String(Date.now()),
    at: new Date().toISOString(),
    user: user?.username || user?.id || 'dashboard',
    keys: Object.keys(applied)
  });
  hist[guildId] = hist[guildId].slice(0, 50);
  saveHistory(hist);

  try {
    const automodKeys = Object.keys(patch || {}).filter(
      (k) => k.startsWith('moderation.automod') || k.startsWith('moderation.blocked')
    );
    if (automodKeys.length) {
      const { normalizeWords, syncDiscordAutoMod } = require('../../utils/automod/helpers.js');
      const db2 = loadDatabase();
      const node = db2.automod?.[guildId] || {};
      let words = node.blockedWords;
      if (typeof words === 'string') words = normalizeWords(words);
      const discordClient = global.__omnibotClient || null;
      const guild = discordClient?.guilds?.cache?.get(String(guildId));
      if (guild) {
        syncDiscordAutoMod(guild, {
          enabled: Boolean(node.enabled) && node.useDiscordAutoMod !== false,
          words: words || []
        }).catch((e) => console.warn('[settingsBridge] automod sync', e?.message || e));
      }
    }
  } catch (e) {
    console.warn('[settingsBridge] automod hook', e?.message || e);
  }

  return getGuildSettings(guildId);
}

function getHistory(guildId) {
  return loadHistory()[guildId] || [];
}

module.exports = { getGuildSettings, applyPatch, getHistory, syncDeadChatToBotStore };
