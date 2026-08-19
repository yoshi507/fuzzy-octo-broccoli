const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sessionFile = path.join(__dirname, '../../data/api-sessions.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function createSession({ user, discordAccessToken }) {
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
    expiresAt,
    createdAt: Date.now()
  };
  save(data);
  return {
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

function destroySession(token) {
  if (!token) return;
  const data = load();
  delete data[token];
  save(data);
}

module.exports = {
  createSession,
  getSession,
  destroySession
};
