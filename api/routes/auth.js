const express = require('express');
const { exchangeCode, fetchUser, fetchUserGuilds } = require('../services/discordOAuth');
const { createSession, destroySession } = require('../services/sessions');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** Public OAuth config for the dashboard (never exposes client secret). */
router.get('/config', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID || null;
  // Preferred redirect — must match Discord Developer Portal exactly
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ||
    process.env.OAUTH_REDIRECT_URI ||
    null;
  res.json({
    clientId,
    scopes: ['identify', 'guilds'],
    redirectUri,
    configured: Boolean(clientId && process.env.DISCORD_CLIENT_SECRET)
  });
});

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
