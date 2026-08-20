const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { assertCanManage } = require('./guilds');
const { getGuildSettings } = require('../services/settingsBridge');
const { loadDatabase } = require('../../database/database.js');
const path = require('path');
const fs = require('fs');

function readAiUsage(guildId) {
  try {
    const limitFile = path.join(__dirname, '../../data/ai-limits.json');
    if (!fs.existsSync(limitFile)) return { used: 0, limit: 20 };
    const data = JSON.parse(fs.readFileSync(limitFile, 'utf8'));
    const today = new Date().toISOString().slice(0, 10);
    const entry = data[guildId];
    const settings = getGuildSettings(guildId);
    const limit = settings['ai.dailyLimit'] ?? 20;
    if (!entry || entry.date !== today) return { used: 0, limit };
    return { used: entry.count || 0, limit };
  } catch {
    return { used: 0, limit: 20 };
  }
}

const botRouter = express.Router({ mergeParams: true });

botRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const client = req.app.locals.discordClient;
    res.json({
      online: Boolean(client?.readyAt || client?.ws),
      guildId: req.params.guildId,
      latencyMs: typeof client?.ws?.ping === 'number' ? client.ws.ping : null,
      uptimeSeconds: client?.uptime != null ? Math.floor(client.uptime / 1000) : null,
      version: require('../../package.json').version || '1.0.0'
    });
  } catch (err) {
    next(err);
  }
});

const statsRouter = express.Router({ mergeParams: true });

statsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { botGuild } = await assertCanManage(req, req.params.guildId);
    const db = loadDatabase();
    const ai = readAiUsage(req.params.guildId);
    const warnings = Array.isArray(db.warnings)
      ? db.warnings.filter((w) => w.guildId === req.params.guildId).length
      : 0;
    let activeGiveaways = 0;
    let reactionRolePanels = 0;
    try {
      const { listActive } = require('../../utils/giveaways/store.js');
      activeGiveaways = listActive(req.params.guildId).length;
    } catch {}
    try {
      const { listConfigs } = require('../../utils/reactionRoles/store.js');
      reactionRolePanels = listConfigs(req.params.guildId).length;
    } catch {}
    res.json({
      guildId: req.params.guildId,
      members: botGuild.memberCount,
      commandsToday: null,
      aiUsedToday: ai.used,
      aiLimit: ai.limit,
      warnings,
      activeGiveaways,
      reactionRolePanels
    });
  } catch (err) {
    next(err);
  }
});

module.exports = { botRouter, statsRouter };
