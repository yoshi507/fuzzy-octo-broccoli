const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { assertCanManage } = require('./guilds');
const {
  getGuildSettings,
  applyPatch,
  getHistory
} = require('../services/settingsBridge');

const router = express.Router({ mergeParams: true });

router.get('/', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    res.json(getGuildSettings(req.params.guildId));
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    const patch = req.body?.patch;
    const nextSettings = applyPatch(req.params.guildId, patch, req.user);
    res.json(nextSettings);
  } catch (err) {
    next(err);
  }
});

router.get('/history', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    res.json(getHistory(req.params.guildId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
