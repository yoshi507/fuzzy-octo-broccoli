const DISCORD_API = 'https://discord.com/api/v10';

function getOAuthCredentials() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error('OAuth is not configured on the server (DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET)');
    err.status = 503;
    err.code = 'OAUTH_NOT_CONFIGURED';
    throw err;
  }
  return { clientId, clientSecret };
}

/**
 * Preferred public redirect URI for Discord OAuth.
 * Server-side callback avoids browser double-exchange bugs.
 */
function getPreferredRedirectUri(req) {
  const envRaw = process.env.DISCORD_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || '';
  const env = String(envRaw).trim();

  // Always prefer the server-side callback path on the same origin.
  // If env is a root URL (legacy), upgrade it to /auth/discord/callback.
  if (env) {
    try {
      const u = new URL(env);
      if (u.pathname.replace(/\/$/, '') === '/auth/discord/callback') {
        return `${u.origin}/auth/discord/callback`;
      }
      // Legacy root redirects → server callback
      if (u.pathname === '/' || u.pathname === '') {
        return `${u.origin}/auth/discord/callback`;
      }
      // Custom path kept as-is
      return env;
    } catch {
      return env;
    }
  }

  const host = req?.get?.('x-forwarded-host') || req?.get?.('host');
  const proto = (req?.get?.('x-forwarded-proto') || req?.protocol || 'https').split(',')[0].trim();
  if (host) return `${proto}://${host}/auth/discord/callback`;
  return null;
}

async function exchangeCodeOnce(code, redirectUri, clientId, clientSecret) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: String(redirectUri)
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function exchangeCode(code, redirectUri) {
  const { clientId, clientSecret } = getOAuthCredentials();
  if (!code || !redirectUri) {
    const err = new Error('code and redirectUri are required');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const primary = String(redirectUri).trim();
  const { res, data } = await exchangeCodeOnce(code, primary, clientId, clientSecret);

  if (res.ok) {
    const scopes = String(data.scope || '').split(/\s+/).filter(Boolean);
    if (!scopes.includes('guilds')) {
      console.warn('[OAuth] token is missing guilds scope. scopes=', scopes.join(' '));
    }
    return data;
  }

  console.error(
    '[OAuth] token exchange failed:',
    res.status,
    data?.error || data?.message || '',
    'redirect_uri=',
    primary
  );

  let msg = data.error_description || data.error || 'OAuth token exchange failed';
  if (data.error === 'invalid_grant' || /invalid.?code/i.test(String(msg))) {
    msg =
      'Login code expired or already used. Close extra tabs, then click Open Dashboard once and do not refresh during login.';
  } else if (data.error === 'invalid_request' || /redirect/i.test(String(msg))) {
    msg =
      'Discord rejected the redirect URL. In the Discord Developer Portal → OAuth2 → Redirects, add exactly: ' +
      primary;
  } else if (data.error === 'invalid_client') {
    msg =
      'Discord rejected the app credentials (client id/secret). Check DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET on the server.';
  }

  const err = new Error(msg);
  err.status = 401;
  err.code = data.error || 'OAUTH_FAILED';
  throw err;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getOAuthCredentials();
  if (!refreshToken) {
    const err = new Error('No refresh token available');
    err.status = 401;
    err.code = 'OAUTH_FAILED';
    throw err;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: String(refreshToken)
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[OAuth] refresh failed:', res.status, data?.error || '');
    const err = new Error('Discord session expired. Please log in again.');
    err.status = 401;
    err.code = 'OAUTH_FAILED';
    throw err;
  }
  return data;
}

async function fetchUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const err = new Error('Failed to fetch Discord user profile');
    err.status = 502;
    err.code = 'DISCORD_USER_FAILED';
    throw err;
  }
  return res.json();
}

async function fetchUserGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || body?.error || '';
    } catch {}
    console.error('[OAuth] fetchUserGuilds failed:', res.status, detail);

    if (res.status === 401 || res.status === 403) {
      const err = new Error(
        'Discord denied access to your server list (missing guilds permission or expired login). Log out and log in again.'
      );
      err.status = 502;
      err.code = 'DISCORD_GUILDS_UNAUTHORIZED';
      err.discordStatus = res.status;
      throw err;
    }

    if (res.status === 429) {
      const err = new Error('Discord rate-limited the server list request. Wait a moment and try again.');
      err.status = 429;
      err.code = 'DISCORD_RATE_LIMITED';
      throw err;
    }

    const err = new Error(
      `Failed to fetch Discord guilds (HTTP ${res.status}${detail ? ': ' + detail : ''}). Try logging out and back in.`
    );
    err.status = 502;
    err.code = 'DISCORD_GUILDS_FAILED';
    err.discordStatus = res.status;
    throw err;
  }

  return res.json();
}

function canManageGuild(permissions, owner) {
  if (owner) return true;
  try {
    const p = BigInt(permissions);
    const ADMIN = 8n;
    const MANAGE_GUILD = 32n;
    return (p & ADMIN) === ADMIN || (p & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

module.exports = {
  exchangeCode,
  refreshAccessToken,
  fetchUser,
  fetchUserGuilds,
  canManageGuild,
  getPreferredRedirectUri,
  DISCORD_API
};
