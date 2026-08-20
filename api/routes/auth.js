const express = require('express');
const { exchangeCode, fetchUser, fetchUserGuilds } = require('../services/discordOAuth');
const { createSession, destroySession } = require('../services/sessions');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/callback', async (req, res, next) => {
  try {
    const { code, redirectUri } = req.body || {};
    const tokenData = await exchangeCode(code, redirectUri);
    const user = await fetchUser(tokenData.access_token);

    let guildsCache = null;
    try {
      guildsCache = await fetchUserGuilds(tokenData.access_token);
    } catch (guildErr) {
      console.warn('[auth/callback] initial guilds fetch failed:', guildErr?.message || guildErr);
    }

    const expiresIn = Number(tokenData.expires_in) || 604800;
    const session = createSession({
      user,
      discordAccessToken: tokenData.access_token,
      discordRefreshToken: tokenData.refresh_token || null,
      discordTokenExpiresAt: Date.now() + expiresIn * 1000,
      guildsCache
    });

    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

router.post('/logout', requireAuth, (req, res) => {
  destroySession(req.sessionToken);
  res.status(204).send();
});

module.exports = router;
