const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sessionFile = path.join(__dirname, '../../data/api-sessions.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GUILDS_CACHE_TTL_MS = 5 * 60 * 1000;

function ensure() {
  const dir = path.dirname(sessionFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(sessionFile)) fs.writeFileSync(sessionFile, '{}', 'utf8');
}

function load() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  ensure();
  fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2), 'utf8');
}

function purgeExpired(data) {
  const now = Date.now();
  let changed = false;
  for (const [token, session] of Object.entries(data)) {
    if (!session?.expiresAt || session.expiresAt < now) {
      delete data[token];
      changed = true;
    }
  }
  return changed;
}

function createSession({
  user,
  discordAccessToken,
  discordRefreshToken = null,
  discordTokenExpiresAt = null,
  guildsCache = null
}) {
  const data = load();
  purgeExpired(data);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  data[token] = {
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar || null,
      discriminator: user.discriminator || '0'
    },
    discordAccessToken,
    discordRefreshToken: discordRefreshToken || null,
    discordTokenExpiresAt: discordTokenExpiresAt || null,
    guildsCache: guildsCache || null,
    guildsCachedAt: guildsCache ? Date.now() : null,
    expiresAt,
    createdAt: Date.now()
  };
  save(data);
  return {
    token: token,
    accessToken: token,
    expiresAt,
    user: data[token].user
  };
}

function getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const data = load();
  if (purgeExpired(data)) save(data);
  const session = data[token];
  if (!session) return null;
  return session;
}

function updateSession(token, patch) {
  if (!token) return null;
  const data = load();
  if (!data[token]) return null;
  data[token] = { ...data[token], ...patch };
  save(data);
  return data[token];
}

function setGuildsCache(token, guilds) {
  return updateSession(token, {
    guildsCache: Array.isArray(guilds) ? guilds : [],
    guildsCachedAt: Date.now()
  });
}

function getGuildsCache(session) {
  if (!session?.guildsCache || !session.guildsCachedAt) return null;
  if (Date.now() - session.guildsCachedAt > GUILDS_CACHE_TTL_MS) return null;
  return session.guildsCache;
}

function destroySession(token) {
  if (!token) return;
  const data = load();
  delete data[token];
  save(data);
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  setGuildsCache,
  getGuildsCache,
  destroySession,
  GUILDS_CACHE_TTL_MS
};
