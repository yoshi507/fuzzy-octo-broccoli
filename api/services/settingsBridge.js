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

function readPath(guildId, storagePath) {
  const parts = storagePath.split('.');
  const root = parts[0];

  if (root === 'appeals') {
    const { getSettings } = require('../../utils/appeals/store.js');
    let node = getSettings(guildId);
    for (let i = 1; i < parts.length; i++) {
      if (node == null) return undefined;
      node = node[parts[i]];
    }
    return node;
  }
  if (root === 'quiz') {
    const { getSettings } = require('../../utils/quiz/store.js');
    let node = getSettings(guildId);
    for (let i = 1; i < parts.length; i++) {
      if (node == null) return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  if (root === 'security') {
    const sec = getGuildSecurity(guildId);
    let node = sec;
    for (let i = 1; i < parts.length; i++) {
      if (node == null) return undefined;
      node = node[parts[i]];
    }
    if (storagePath === 'security.antiNuke.windowMs' && typeof node === 'number') {
      return Math.round(node / 1000);
    }
    return node;
  }

  if (root === 'deadChat') {
    const db = loadDatabase();
    const dc = db.dashboard?.[guildId]?.deadChat || {};
    if (parts[1] === 'enabled') return Boolean(dc.enabled);
    if (parts[1] === 'minutes') return dc.minutes ?? 30;
    return undefined;
  }

  if (root === 'aiLimit') {
    const db = loadDatabase();
    const override = db.dashboard?.[guildId]?.ai?.dailyLimit;
    return override != null ? override : 20;
  }

  const db = loadDatabase();

  if (root === 'dashboard') {
    let node = db.dashboard?.[guildId];
    for (let i = 1; i < parts.length; i++) {
      if (node == null) return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  if (root === 'spamConfig') {
    const cfg = db.spamConfig?.[guildId];
    if (parts[1] === 'enabled') return cfg?.enabled !== false;
    return undefined;
  }

  if (root === 'music') {
    const m = db.music?.[guildId] || {};
    if (parts[1] === 'enabled') return m.enabled !== false;
    if (parts[1] === 'defaultVolume') return m.defaultVolume ?? 80;
    return undefined;
  }

  if (root === 'commandSettings') {
    const c = db.commandSettings?.[guildId] || {};
    if (parts[1] === 'prefix') return c.prefix || '!';
    return undefined;
  }

  let node = db[root]?.[guildId];
  for (let i = 1; i < parts.length; i++) {
    if (node == null) return undefined;
    node = node[parts[i]];
  }
  return node;
}

function writePath(guildId, storagePath, value) {
  const parts = storagePath.split('.');
  const root = parts[0];

  if (root === 'appeals') {
    const { setSettings } = require('../../utils/appeals/store.js');
    const keys = parts.slice(1);
    if (keys.length === 1) setSettings(guildId, { [keys[0]]: value });
    return;
  }
  if (root === 'quiz') {
    const { setSettings } = require('../../utils/quiz/store.js');
    const keys = parts.slice(1);
    if (keys.length === 1) setSettings(guildId, { [keys[0]]: value });
    return;
  }

  if (root === 'security') {
    const sec = getGuildSecurity(guildId);
    let node = sec;
    for (let i = 1; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    let writeVal = value;
    if (storagePath === 'security.antiNuke.windowMs') writeVal = Math.round(Number(value) * 1000);
    node[parts[parts.length - 1]] = writeVal;
    setGuildSecurity(guildId, sec);
    return;
  }

  if (root === 'deadChat') {
    const db = loadDatabase();
    ensureGuildObj(db, 'dashboard', guildId);
    if (!db.dashboard[guildId].deadChat) db.dashboard[guildId].deadChat = {};
    if (parts[1] === 'enabled') db.dashboard[guildId].deadChat.enabled = Boolean(value);
    if (parts[1] === 'minutes') db.dashboard[guildId].deadChat.minutes = Number(value);
    saveDatabase(db);
    return;
  }

  const db = loadDatabase();

  if (root === 'aiLimit') {
    ensureGuildObj(db, 'dashboard', guildId);
    if (!db.dashboard[guildId].ai) db.dashboard[guildId].ai = {};
    db.dashboard[guildId].ai.dailyLimit = Number(value);
    saveDatabase(db);
    return;
  }

  if (root === 'dashboard') {
    ensureGuildObj(db, 'dashboard', guildId);
    let node = db.dashboard[guildId];
    for (let i = 1; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
    saveDatabase(db);
    return;
  }

  if (root === 'spamConfig') {
    ensureGuildObj(db, 'spamConfig', guildId);
    if (parts[1] === 'enabled') db.spamConfig[guildId].enabled = Boolean(value);
    saveDatabase(db);
    return;
  }

  if (root === 'music') {
    ensureGuildObj(db, 'music', guildId);
    db.music[guildId][parts[1]] = value;
    saveDatabase(db);
    return;
  }

  if (root === 'commandSettings') {
    ensureGuildObj(db, 'commandSettings', guildId);
    db.commandSettings[guildId][parts[1]] = value;
    saveDatabase(db);
    return;
  }

  ensureGuildObj(db, root, guildId);
  let node = db[root][guildId];
  for (let i = 1; i < parts.length - 1; i++) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  saveDatabase(db);
}

function getGuildSettings(guildId) {
  const result = getDefaults();
  for (const def of SETTINGS) {
    const raw = readPath(guildId, def.path);
    if (raw !== undefined) result[def.id] = raw;
  }
  return result;
}

function applyPatch(guildId, patch, user) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    const err = new Error('patch must be an object');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }
  const errors = {};
  const applied = {};
  for (const [id, value] of Object.entries(patch)) {
    const def = getSettingById(id);
    const result = validateSetting(def, value);
    if (!result.ok) {
      errors[id] = result.error;
      continue;
    }
    applied[id] = result.value;
  }
  if (Object.keys(errors).length) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.code = 'VALIDATION';
    err.errors = errors;
    throw err;
  }
  for (const [id, value] of Object.entries(applied)) {
    writePath(guildId, getSettingById(id).path, value);
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
  return getGuildSettings(guildId);
}

function getHistory(guildId) {
  return loadHistory()[guildId] || [];
}

module.exports = { getGuildSettings, applyPatch, getHistory };
