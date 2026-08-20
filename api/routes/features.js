const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { assertCanManage } = require('./guilds');
const { getHistory } = require('../services/settingsBridge');
const { loadDatabase } = require('../../database/database.js');

const router = express.Router({ mergeParams: true });

router.get('/giveaways', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const { listActive, getSettings } = require('../../utils/giveaways/store.js');
    const active = listActive(req.params.guildId).map((g) => ({
      id: g.id,
      prize: g.prize,
      winners: g.winners,
      endsAt: g.endsAt,
      channelId: g.channelId,
      status: g.status,
      entries: Array.isArray(g.entries) ? g.entries.length : 0
    }));
    res.json({ settings: getSettings(req.params.guildId), active });
  } catch (err) {
    next(err);
  }
});

router.put('/giveaways/settings', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const { setSettings, getSettings } = require('../../utils/giveaways/store.js');
    const patch = {};
    if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
    setSettings(req.params.guildId, patch);
    res.json(getSettings(req.params.guildId));
  } catch (err) {
    next(err);
  }
});

router.get('/reaction-roles', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const { listConfigs } = require('../../utils/reactionRoles/store.js');
    res.json({ configs: listConfigs(req.params.guildId) });
  } catch (err) {
    next(err);
  }
});

router.delete('/reaction-roles/:configId', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const { removeConfig, listConfigs } = require('../../utils/reactionRoles/store.js');
    removeConfig(req.params.guildId, req.params.configId);
    res.json({ configs: listConfigs(req.params.guildId) });
  } catch (err) {
    next(err);
  }
});

router.get('/settings-history', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    res.json({ history: getHistory(req.params.guildId) });
  } catch (err) {
    next(err);
  }
});

router.get('/moderation-summary', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const db = loadDatabase();
    const guildId = req.params.guildId;
    const warnings = Array.isArray(db.warnings)
      ? db.warnings.filter((w) => String(w.guildId) === String(guildId))
      : [];
    res.json({
      warningCount: warnings.length,
      recentWarnings: warnings.slice(-15).reverse().map((w) => ({
        userId: w.userId,
        moderatorId: w.moderatorId,
        reason: w.reason || null,
        at: w.at || w.timestamp || null
      })),
      automodEnabled: Boolean(db.automod?.[guildId]?.enabled),
      antiSpamEnabled: db.spamConfig?.[guildId]?.enabled !== false
    });
  } catch (err) {
    next(err);
  }
});

router.get('/tickets', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const db = loadDatabase();
    const settings = db.ticketSettings?.[req.params.guildId] || {
      enabled: false,
      panelChannelId: null,
      staffRoleIds: []
    };
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
