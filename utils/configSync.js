/**
 * Shared helpers so Discord commands and the dashboard read/write the same
 * per-guild configuration shapes.
 */
const { loadDatabase, saveDatabase } = require('../database/database.js');

function ensureGuildBucket(db, key, guildId) {
  if (!db[key]) db[key] = {};
  if (!db[key][guildId] || typeof db[key][guildId] !== 'object') {
    db[key][guildId] = {};
  }
  return db[key][guildId];
}

/** Merge-patch a guild-scoped object in omnibot.json (does not wipe sibling keys). */
function mergeGuildConfig(rootKey, guildId, patch) {
  const db = loadDatabase();
  const bucket = ensureGuildBucket(db, rootKey, guildId);
  Object.assign(bucket, patch);
  saveDatabase(db);
  return bucket;
}

/** Mirror dead-chat channel settings into dashboard guild config (and back). */
function mirrorDeadChatToDashboard(guildId, channelId, settings) {
  const db = loadDatabase();
  if (!db.dashboard) db.dashboard = {};
  if (!db.dashboard[guildId]) db.dashboard[guildId] = {};
  const enabled = Boolean(settings?.enabled);
  db.dashboard[guildId].deadChat = {
    ...(db.dashboard[guildId].deadChat || {}),
    enabled,
    minutes:
      typeof settings?.minutes === 'number' && settings.minutes > 0
        ? settings.minutes
        : db.dashboard[guildId].deadChat?.minutes || 30,
    channelId: enabled ? channelId || db.dashboard[guildId].deadChat?.channelId || null : (channelId || null)
  };
  if (!enabled) {
    db.dashboard[guildId].deadChat.enabled = false;
  }
  saveDatabase(db);
  return db.dashboard[guildId].deadChat;
}

/** When dashboard updates dead chat, also write the channel-based bot store. */
function mirrorDeadChatToChannelStore(guildId, dc) {
  if (!dc?.channelId) return;
  try {
    const { getSettings, setSettings, disable } = require('./ai/deadChat.js');
    if (!dc.enabled) {
      disable(dc.channelId);
      return;
    }
    const prev = getSettings(dc.channelId) || {};
    setSettings(dc.channelId, {
      ...prev,
      enabled: true,
      minutes: Number(dc.minutes) > 0 ? Number(dc.minutes) : 30,
      lastRevival: prev.lastRevival || 0,
      guildId: String(guildId)
    });
  } catch (err) {
    console.warn('[configSync] deadChat channel mirror failed:', err?.message || err);
  }
}

/**
 * Resolve effective dead-chat state for a guild by combining dashboard config
 * with any channel entries tagged with this guildId (or the configured channel).
 */
function resolveDeadChatForGuild(guildId) {
  const db = loadDatabase();
  const dash = db.dashboard?.[guildId]?.deadChat || {};
  let enabled = Boolean(dash.enabled);
  let minutes = dash.minutes ?? 30;
  let channelId = dash.channelId || null;

  try {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '../data/dead-chat-settings.json');
    if (fs.existsSync(file)) {
      const all = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (channelId && all[channelId]) {
        const s = all[channelId];
        enabled = Boolean(s.enabled);
        if (typeof s.minutes === 'number') minutes = s.minutes;
      } else {
        for (const [cid, s] of Object.entries(all || {})) {
          if (!s || typeof s !== 'object') continue;
          if (String(s.guildId) === String(guildId) && s.enabled) {
            enabled = true;
            channelId = cid;
            if (typeof s.minutes === 'number') minutes = s.minutes;
            break;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  return { enabled, minutes, channelId };
}

module.exports = {
  mergeGuildConfig,
  mirrorDeadChatToDashboard,
  mirrorDeadChatToChannelStore,
  resolveDeadChatForGuild,
  ensureGuildBucket
};
