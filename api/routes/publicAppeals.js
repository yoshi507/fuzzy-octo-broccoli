const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getSettings,
  createAppeal,
  findOpenByUser,
  lastClosedAt,
  listAppeals
} = require('../../utils/appeals/store.js');

const router = express.Router();

/** In-memory directory of guilds with appeals enabled. Refreshed at most once per hour. */
let directoryCache = {
  at: 0,
  guilds: []
};

const DIRECTORY_TTL_MS = 60 * 60 * 1000;

function getClient(req) {
  return req.app.locals.discordClient || global.__omnibotClient || null;
}

function guildIconHash(guild) {
  return guild?.icon || null;
}

function buildDirectory(client) {
  const out = [];
  if (!client?.guilds?.cache) return out;
  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = getSettings(guild.id);
      if (!settings?.enabled) continue;
      out.push({
        id: guild.id,
        name: guild.name,
        icon: guildIconHash(guild),
        category: settings.category || 'ban',
        memberCount: guild.memberCount || null
      });
    } catch {
      /* skip broken guild entries */
    }
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

function getAppealsDirectory(client, { force } = {}) {
  const now = Date.now();
  if (
    !force &&
    directoryCache.at &&
    now - directoryCache.at < DIRECTORY_TTL_MS &&
    Array.isArray(directoryCache.guilds)
  ) {
    return {
      guilds: directoryCache.guilds,
      refreshedAt: directoryCache.at,
      nextRefreshAt: directoryCache.at + DIRECTORY_TTL_MS,
      cached: true
    };
  }
  const guilds = buildDirectory(client);
  directoryCache = { at: now, guilds };
  return {
    guilds,
    refreshedAt: now,
    nextRefreshAt: now + DIRECTORY_TTL_MS,
    cached: false
  };
}

router.get('/directory', requireAuth, async (req, res, next) => {
  try {
    const client = getClient(req);
    if (!client) {
      const err = new Error('Bot is offline');
      err.status = 503;
      err.code = 'BOT_OFFLINE';
      throw err;
    }
    const force = String(req.query.force || '') === '1';
    const payload = getAppealsDirectory(client, { force });
    res.json(payload);
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
    const settings = getSettings(guildId);
    if (!settings.enabled) {
      const err = new Error('Appeals are disabled on this server');
      err.status = 403;
      err.code = 'APPEALS_DISABLED';
      throw err;
    }
    const guild = client.guilds.cache.get(guildId);
    const open = findOpenByUser(guildId, req.user.id);
    res.json({
      guildId,
      guildName: guild?.name || 'Server',
      guildIcon: guildIconHash(guild),
      category: settings.category || 'ban',
      types: [
        { id: 'ban', label: 'Ban' },
        { id: 'timeout', label: 'Timeout / Mute' },
        { id: 'warn', label: 'Warning' }
      ],
      questions: (settings.questions || []).map((q) => ({
        id: q.id,
        label: q.label,
        required: Boolean(q.required)
      })),
      pendingMessage: settings.pendingMessage,
      openAppealId: open?.id || null
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
      err.code = 'BOT_NOT_IN_GUILD';
      throw err;
    }

    const settings = getSettings(guildId);
    if (!settings.enabled) {
      const err = new Error('Appeals are disabled on this server');
      err.status = 403;
      err.code = 'APPEALS_DISABLED';
      throw err;
    }

    const userId = req.user.id;
    const open = findOpenByUser(guildId, userId);
    if (open) {
      const err = new Error(
        `You already have an open appeal (${open.id}) on this server.`
      );
      err.status = 409;
      err.code = 'APPEAL_OPEN';
      throw err;
    }

    const cooldownHours = Number(settings.cooldownHours) || 72;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
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
      if (val != null && String(val).trim()) {
        answers[q.id] = String(val).slice(0, 1000);
      }
    }

    const allowedTypes = new Set(['ban', 'timeout', 'warn', 'mute', 'warning']);
    let appealType = String(req.body?.type || settings.category || 'ban').toLowerCase();
    if (appealType === 'mute') appealType = 'timeout';
    if (appealType === 'warning') appealType = 'warn';
    if (!allowedTypes.has(appealType)) appealType = 'ban';

    const appeal = createAppeal(guildId, {
      userId,
      username: req.user.global_name || req.user.username,
      type: appealType,
      answers
    });

    try {
      if (settings.channelId) {
        const guild = client.guilds.cache.get(guildId);
        const ch = guild?.channels?.cache?.get(settings.channelId);
        if (ch && typeof ch.send === 'function') {
          const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const { updateAppeal } = require('../../utils/appeals/store.js');
          const typeLabel =
            appealType === 'timeout' ? 'Timeout / Mute' :
            appealType === 'warn' ? 'Warning' : 'Ban';
          const lines = (settings.questions || []).map((q) => {
            const ans = answers[q.id] || '—';
            return `**${q.label}**\n${ans}`;
          });
          const embed = new EmbedBuilder()
            .setTitle(`Appeal ${appeal.id}`)
            .setColor(settings.embedColor || 0x5865f2)
            .setDescription(lines.join('\n\n') || '*No answers*')
            .addFields(
              { name: 'User', value: `<@${userId}> (\`${userId}\`)`, inline: true },
              { name: 'Type', value: typeLabel, inline: true },
              { name: 'Status', value: 'pending', inline: true }
            )
            .setFooter({ text: 'Accept / Reject buttons · or /appeal accept|reject' });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`appeal_accept:${appeal.id}`)
              .setLabel('Accept')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`appeal_reject:${appeal.id}`)
              .setLabel('Reject')
              .setStyle(ButtonStyle.Danger)
          );
          const mention = (settings.staffRoleIds || []).map((id) => `<@&${id}>`).join(' ');
          const msg = await ch.send({
            content: mention || undefined,
            embeds: [embed],
            components: [row]
          });
          updateAppeal(guildId, appeal.id, {
            messageId: msg.id,
            channelId: ch.id
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
    const mine = [];
    if (client?.guilds?.cache) {
      for (const guild of client.guilds.cache.values()) {
        for (const a of listAppeals(guild.id)) {
          if (a.userId === req.user.id) {
            mine.push({
              id: a.id,
              guildId: guild.id,
              guildName: guild.name,
              status: a.status,
              createdAt: a.createdAt,
              updatedAt: a.updatedAt
            });
          }
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
