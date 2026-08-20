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
    let settings;
    try {
      settings = getGuildSettings(req.params.guildId);
    } catch (loadErr) {
      console.error('[settings] getGuildSettings failed:', loadErr?.message || loadErr);
      const err = new Error('Failed to load guild settings');
      err.status = 500;
      err.code = 'SETTINGS_LOAD_FAILED';
      throw err;
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    await assertCanManage(req, req.params.guildId);
    // Accept either { patch } or { settings } for compatibility
    const patch = req.body?.patch ?? req.body?.settings;
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
