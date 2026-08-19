const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { fetchUserGuilds } = require('../services/discordOAuth');
const {
  getSettings,
  createAppeal,
  findOpenByUser,
  lastClosedAt,
  listAppeals
} = require('../../utils/appeals/store.js');

const router = express.Router();

function getClient(req) {
  return req.app.locals.discordClient;
}

router.get('/guilds', requireAuth, async (req, res, next) => {
  try {
    const client = getClient(req);
    const guilds = await fetchUserGuilds(req.session.discordAccessToken);
    const out = [];
    for (const g of guilds) {
      if (!client?.guilds?.cache?.has(g.id)) continue;
      const settings = getSettings(g.id);
      if (!settings.enabled) continue;
      out.push({
        id: g.id,
        name: g.name,
        icon: g.icon,
        category: settings.category || 'ban'
      });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.get('/guilds/:guildId/form', requireAuth, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    if (!/^\d{16,20}$/.test(String(guildId))) {
      const err = new Error('Invalid guild id');
      err.status = 400;
      throw err;
    }
    const client = getClient(req);
    if (!client?.guilds?.cache?.has(guildId)) {
      const err = new Error('OmniBot is not in this server');
      err.status = 404;
      err.code = 'BOT_NOT_IN_GUILD';
      throw err;
    }
    const userGuilds = await fetchUserGuilds(req.session.discordAccessToken);
    if (!userGuilds.some((g) => g.id === guildId)) {
      const err = new Error('You are not associated with this server');
      err.status = 403;
      throw err;
    }
    const settings = getSettings(guildId);
    if (!settings.enabled) {
      const err = new Error('Appeals are disabled on this server');
      err.status = 403;
      err.code = 'APPEALS_DISABLED';
      throw err;
    }
    const guild = client.guilds.cache.get(guildId);
    res.json({
      guildId,
      guildName: guild?.name || 'Server',
      category: settings.category || 'ban',
      questions: (settings.questions || []).map((q) => ({
        id: q.id,
        label: q.label,
        required: Boolean(q.required)
      })),
      pendingMessage: settings.pendingMessage
    });
  } catch (err) {
    next(err);
  }
});

router.post('/guilds/:guildId/submit', requireAuth, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    if (!/^\d{16,20}$/.test(String(guildId))) {
      const err = new Error('Invalid guild id');
      err.status = 400;
      throw err;
    }
    const client = getClient(req);
    if (!client?.guilds?.cache?.has(guildId)) {
      const err = new Error('OmniBot is not in this server');
      err.status = 404;
      throw err;
    }
    const userGuilds = await fetchUserGuilds(req.session.discordAccessToken);
    if (!userGuilds.some((g) => g.id === guildId)) {
      const err = new Error('You are not associated with this server');
      err.status = 403;
      throw err;
    }
    const settings = getSettings(guildId);
    if (!settings.enabled) {
      const err = new Error('Appeals are disabled on this server');
      err.status = 403;
      throw err;
    }

    const userId = req.user.id;
    const open = findOpenByUser(guildId, userId);
    if (open) {
      const err = new Error(
        `You already have an open appeal (${open.id}). Wait for staff to review it.`
      );
      err.status = 409;
      err.code = 'APPEAL_OPEN';
      throw err;
    }

    const cooldownMs = (settings.cooldownHours || 72) * 60 * 60 * 1000;
    const last = lastClosedAt(guildId, userId);
    if (last && Date.now() - last < cooldownMs) {
      const hoursLeft = Math.ceil((cooldownMs - (Date.now() - last)) / 3600000);
      const err = new Error(
        `Appeal cooldown active. Try again in about ${hoursLeft} hour(s).`
      );
      err.status = 429;
      err.code = 'APPEAL_COOLDOWN';
      throw err;
    }

    const answersIn = req.body?.answers || {};
    const answers = {};
    for (const q of settings.questions || []) {
      const val = answersIn[q.id];
      if (q.required && (!val || !String(val).trim())) {
        const err = new Error(`Missing required answer: ${q.label}`);
        err.status = 400;
        err.code = 'VALIDATION';
        throw err;
      }
      if (val != null) answers[q.id] = String(val).slice(0, 1000);
    }

    const appeal = createAppeal(guildId, {
      userId,
      username: req.user.global_name || req.user.username,
      type: settings.category || 'ban',
      answers
    });

    try {
      if (settings.channelId) {
        const ch = client.guilds.cache.get(guildId)?.channels?.cache?.get(settings.channelId);
        if (ch?.isTextBased?.()) {
          await ch.send({
            content:
              `📨 **New appeal** \`${appeal.id}\` from <@${userId}> (${appeal.username})\n` +
              `Type: **${appeal.type}** · Status: **pending**`
          });
        }
      }
    } catch (notifyErr) {
      console.error('Appeal notify error:', notifyErr?.message || notifyErr);
    }

    res.status(201).json({
      id: appeal.id,
      status: appeal.status,
      message: settings.pendingMessage || 'Your appeal was submitted.'
    });
  } catch (err) {
    next(err);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const client = getClient(req);
    const userGuilds = await fetchUserGuilds(req.session.discordAccessToken);
    const mine = [];
    for (const g of userGuilds) {
      if (!client?.guilds?.cache?.has(g.id)) continue;
      for (const a of listAppeals(g.id)) {
        if (a.userId === req.user.id) {
          mine.push({
            id: a.id,
            guildId: g.id,
            guildName: g.name,
            status: a.status,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt
          });
        }
      }
    }
    mine.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(mine);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
