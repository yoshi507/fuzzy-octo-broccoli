const express = require('express');
const {
  exchangeCode,
  fetchUser,
  fetchUserGuilds,
  getPreferredRedirectUri
} = require('../services/discordOAuth');
const { createSession, destroySession } = require('../services/sessions');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Prevent the same authorization code being exchanged twice (in-process)
const usedCodes = new Map();
const CODE_TTL_MS = 5 * 60 * 1000;

function rememberCode(code) {
  const now = Date.now();
  for (const [k, t] of usedCodes) {
    if (now - t > CODE_TTL_MS) usedCodes.delete(k);
  }
  if (usedCodes.has(code)) return false;
  usedCodes.set(code, now);
  return true;
}

/** Public OAuth config for the dashboard (never exposes client secret). */
router.get('/config', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID || null;
  const redirectUri = getPreferredRedirectUri(req);
  res.json({
    clientId,
    scopes: ['identify', 'guilds'],
    redirectUri,
    callbackPath: '/auth/discord/callback',
    configured: Boolean(clientId && process.env.DISCORD_CLIENT_SECRET)
  });
});

/**
 * Discord redirects here after the user authorizes.
 * Exchanges the code ON THE SERVER (once), then sends the browser back to the dashboard with a session token.
 */
router.get('/discord/callback', async (req, res) => {
  const fail = (message) => {
    const q = new URLSearchParams({ login_error: message || 'Login failed' });
    return res.redirect('/?' + q.toString());
  };

  try {
    const err = req.query.error;
    const errDesc = req.query.error_description;
    if (err) {
      return fail(String(errDesc || err));
    }

    const code = req.query.code;
    if (!code || typeof code !== 'string') {
      return fail('Missing login code from Discord.');
    }

    if (!rememberCode(code)) {
      return fail('Login code was already used. Click Open Dashboard once and try again.');
    }

    const redirectUri = getPreferredRedirectUri(req);
    if (!redirectUri) {
      return fail('Server redirect URI is not configured.');
    }

    const tokenData = await exchangeCode(code, redirectUri);
    const user = await fetchUser(tokenData.access_token);

    let guildsCache = null;
    try {
      guildsCache = await fetchUserGuilds(tokenData.access_token);
    } catch (guildErr) {
      console.warn('[auth/discord/callback] guilds fetch failed:', guildErr?.message || guildErr);
    }

    const expiresIn = Number(tokenData.expires_in) || 604800;
    const session = createSession({
      user,
      discordAccessToken: tokenData.access_token,
      discordRefreshToken: tokenData.refresh_token || null,
      discordTokenExpiresAt: Date.now() + expiresIn * 1000,
      guildsCache
    });

    const token = session.token || session.accessToken;
    const q = new URLSearchParams({ login_token: token });
    return res.redirect('/?' + q.toString());
  } catch (e) {
    console.error('[auth/discord/callback]', e?.message || e);
    return fail(e?.message || 'Login failed');
  }
});

/** Legacy JSON callback (SPA posts the code). Kept for compatibility. */
router.post('/callback', async (req, res, next) => {
  try {
    const { code, redirectUri } = req.body || {};
    if (!code) {
      const err = new Error('code is required');
      err.status = 400;
      err.code = 'VALIDATION';
      throw err;
    }
    if (!rememberCode(String(code))) {
      const err = new Error('Login code was already used. Click Open Dashboard once and try again.');
      err.status = 401;
      err.code = 'OAUTH_FAILED';
      throw err;
    }

    const uri = redirectUri || getPreferredRedirectUri(req);
    const tokenData = await exchangeCode(code, uri);
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
