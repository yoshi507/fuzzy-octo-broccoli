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

/**
 * Single-flight + short-lived cache per Discord authorization code.
 * Duplicate callback hits (browser/proxy) share the same exchange result.
 */
const codeJobs = new Map(); // code -> { promise, token, user, at }
const CODE_CACHE_TTL_MS = 2 * 60 * 1000;

function pruneCodeJobs() {
  const now = Date.now();
  for (const [code, job] of codeJobs) {
    if (job.at && now - job.at > CODE_CACHE_TTL_MS) codeJobs.delete(code);
  }
}

function loginWithDiscordCode(code, redirectUri) {
  pruneCodeJobs();
  const key = String(code);

  const existing = codeJobs.get(key);
  if (existing) {
    if (existing.token) {
      return Promise.resolve({ token: existing.token, user: existing.user });
    }
    if (existing.promise) return existing.promise;
  }

  const job = { at: Date.now(), promise: null, token: null, user: null };

  const promise = (async () => {
    try {
      const tokenData = await exchangeCode(key, redirectUri);
      const user = await fetchUser(tokenData.access_token);

      let guildsCache = null;
      try {
        guildsCache = await fetchUserGuilds(tokenData.access_token);
      } catch (guildErr) {
        console.warn('[auth] guilds fetch failed:', guildErr?.message || guildErr);
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
      job.token = token;
      job.user = session.user;
      job.at = Date.now();
      return { token, user: session.user };
    } catch (err) {
      codeJobs.delete(key);
      throw err;
    }
  })();

  job.promise = promise;
  codeJobs.set(key, job);
  return promise;
}

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

router.get('/discord/callback', async (req, res) => {
  const fail = (message) => {
    const q = new URLSearchParams({ login_error: String(message || 'Login failed') });
    return res.redirect('/?' + q.toString());
  };

  try {
    if (req.query.error) {
      return fail(req.query.error_description || req.query.error);
    }

    const code = req.query.code;
    if (!code || typeof code !== 'string') {
      return fail('Missing login code from Discord.');
    }

    const redirectUri = getPreferredRedirectUri(req);
    if (!redirectUri) {
      return fail('Server redirect URI is not configured.');
    }

    const { token } = await loginWithDiscordCode(code, redirectUri);
    return res.redirect('/?' + new URLSearchParams({ login_token: token }).toString());
  } catch (e) {
    console.error('[auth/discord/callback]', e?.message || e);
    const cached = codeJobs.get(String(req.query.code || ''));
    if (cached && cached.token) {
      return res.redirect('/?' + new URLSearchParams({ login_token: cached.token }).toString());
    }
    return fail(e?.message || 'Login failed');
  }
});

router.post('/callback', async (req, res, next) => {
  try {
    const { code, redirectUri } = req.body || {};
    if (!code) {
      const err = new Error('code is required');
      err.status = 400;
      err.code = 'VALIDATION';
      throw err;
    }
    const uri = redirectUri || getPreferredRedirectUri(req);
    const { token, user } = await loginWithDiscordCode(String(code), uri);
    res.json({ token, accessToken: token, user });
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
