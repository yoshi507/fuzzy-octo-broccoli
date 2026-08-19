const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { fetchUserGuilds, canManageGuild } = require('../services/discordOAuth');

const router = express.Router();

function getClient(req) {
  return req.app.locals.discordClient;
}

async function assertCanManage(req, guildId) {
  if (!/^\d{16,20}$/.test(String(guildId))) {
    const err = new Error('Invalid guild id');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const guilds = await fetchUserGuilds(req.session.discordAccessToken);
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
    const guilds = await fetchUserGuilds(req.session.discordAccessToken);
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
