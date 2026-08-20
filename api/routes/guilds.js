const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  fetchUserGuilds,
  canManageGuild,
  refreshAccessToken
} = require('../services/discordOAuth');
const {
  getGuildsCache,
  setGuildsCache,
  updateSession
} = require('../services/sessions');

const router = express.Router();

function getClient(req) {
  return req.app.locals.discordClient;
}

async function ensureDiscordAccessToken(req) {
  let accessToken = req.session.discordAccessToken;
  if (!accessToken) {
    const err = new Error('Missing Discord access token. Please log out and log in again.');
    err.status = 401;
    err.code = 'OAUTH_FAILED';
    throw err;
  }

  const expiresAt = req.session.discordTokenExpiresAt;
  const needsRefresh =
    req.session.discordRefreshToken &&
    expiresAt &&
    Date.now() > Number(expiresAt) - 60_000;

  if (needsRefresh) {
    try {
      const refreshed = await refreshAccessToken(req.session.discordRefreshToken);
      accessToken = refreshed.access_token;
      const expiresIn = Number(refreshed.expires_in) || 604800;
      updateSession(req.sessionToken, {
        discordAccessToken: accessToken,
        discordRefreshToken: refreshed.refresh_token || req.session.discordRefreshToken,
        discordTokenExpiresAt: Date.now() + expiresIn * 1000
      });
      req.session.discordAccessToken = accessToken;
    } catch (err) {
      console.warn('[guilds] token refresh failed:', err?.message || err);
    }
  }

  return accessToken;
}

async function loadUserGuilds(req, { force = false } = {}) {
  if (!force) {
    const cached = getGuildsCache(req.session);
    if (cached) return cached;
  }

  let accessToken = await ensureDiscordAccessToken(req);

  try {
    const guilds = await fetchUserGuilds(accessToken);
    setGuildsCache(req.sessionToken, guilds);
    req.session.guildsCache = guilds;
    req.session.guildsCachedAt = Date.now();
    return guilds;
  } catch (err) {
    // One retry after forced refresh when Discord rejects the token
    if (
      (err.code === 'DISCORD_GUILDS_UNAUTHORIZED' || err.discordStatus === 401) &&
      req.session.discordRefreshToken
    ) {
      try {
        const refreshed = await refreshAccessToken(req.session.discordRefreshToken);
        accessToken = refreshed.access_token;
        const expiresIn = Number(refreshed.expires_in) || 604800;
        updateSession(req.sessionToken, {
          discordAccessToken: accessToken,
          discordRefreshToken: refreshed.refresh_token || req.session.discordRefreshToken,
          discordTokenExpiresAt: Date.now() + expiresIn * 1000
        });
        req.session.discordAccessToken = accessToken;
        const guilds = await fetchUserGuilds(accessToken);
        setGuildsCache(req.sessionToken, guilds);
        return guilds;
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}

async function assertCanManage(req, guildId) {
  if (!/^\d{16,20}$/.test(String(guildId))) {
    const err = new Error('Invalid guild id');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const guilds = await loadUserGuilds(req);
  const entry = guilds.find((g) => g.id === guildId);
  if (!entry || !canManageGuild(entry.permissions, entry.owner)) {
    const err = new Error('You do not have permission to manage this server');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const client = getClient(req);
  const botGuild = client?.guilds?.cache?.get(guildId);
  if (!botGuild) {
    const err = new Error('OmniBot is not in this server');
    err.status = 404;
    err.code = 'BOT_NOT_IN_GUILD';
    throw err;
  }

  return { entry, botGuild };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const client = getClient(req);
    const guilds = await loadUserGuilds(req);
    const managed = guilds
      .filter((g) => canManageGuild(g.permissions, g.owner))
      .filter((g) => client?.guilds?.cache?.has(g.id))
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: Boolean(g.owner),
        permissions: String(g.permissions),
        approximate_member_count: client.guilds.cache.get(g.id)?.memberCount
      }));
    res.json(managed);
  } catch (err) {
    next(err);
  }
});

router.get('/:guildId', requireAuth, async (req, res, next) => {
  try {
    const { entry, botGuild } = await assertCanManage(req, req.params.guildId);
    res.json({
      id: entry.id,
      name: entry.name,
      icon: entry.icon,
      owner: Boolean(entry.owner),
      permissions: String(entry.permissions),
      approximate_member_count: botGuild.memberCount
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:guildId/channels', requireAuth, async (req, res, next) => {
  try {
    const { botGuild } = await assertCanManage(req, req.params.guildId);
    const channels = [...botGuild.channels.cache.values()]
      .filter((c) => c && (typeof c.isTextBased === 'function' ? c.isTextBased() || c.isVoiceBased?.() : true))
      .filter((c) => c.type === 0 || c.type === 2 || c.type === 5 || c.type === 13 || c.type === 15)
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));
    res.json(channels);
  } catch (err) {
    next(err);
  }
});

router.get('/:guildId/roles', requireAuth, async (req, res, next) => {
  try {
    const { botGuild } = await assertCanManage(req, req.params.guildId);
    const roles = [...botGuild.roles.cache.values()]
      .filter((r) => r && r.id !== botGuild.id)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }));
    res.json(roles);
  } catch (err) {
    next(err);
  }
});

module.exports = { router, assertCanManage };
