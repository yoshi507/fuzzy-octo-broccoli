const express = require('express');
const {
  CATEGORIES,
  listDirectory,
  groupByCategory
} = require('../../utils/advertise/store.js');

const router = express.Router();

/** Public directory — no auth required (discovery page). */
router.get('/directory', (req, res) => {
  try {
    const category = String(req.query.category || 'all').toLowerCase();
    const search = String(req.query.search || '').slice(0, 80);
    const rows = listDirectory({
      category: category === 'all' ? null : category,
      search
    });
    const grouped = groupByCategory(rows);
    res.json({
      categories: CATEGORIES,
      total: rows.length,
      guilds: rows,
      byCategory: grouped,
      inviteBotUrl:
        process.env.BOT_INVITE_URL ||
        'https://discord.com/oauth2/authorize?client_id=' +
          (process.env.CLIENT_ID ||
            process.env.DISCORD_CLIENT_ID ||
            '1538542627882799155')
    });
  } catch (err) {
    console.error('[advertise] directory error:', err?.message || err);
    res.status(500).json({ error: 'Failed to load advertise directory' });
  }
});

router.get('/categories', (_req, res) => {
  res.json({ categories: CATEGORIES });
});

module.exports = router;
