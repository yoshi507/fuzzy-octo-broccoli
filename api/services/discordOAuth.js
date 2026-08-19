const DISCORD_API = 'https://discord.com/api/v10';

async function exchangeCode(code, redirectUri) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error('OAuth is not configured on the server');
    err.status = 503;
    err.code = 'OAUTH_NOT_CONFIGURED';
    throw err;
  }
  if (!code || !redirectUri) {
    const err = new Error('code and redirectUri are required');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

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
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'OAuth token exchange failed');
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
    const err = new Error('Failed to fetch Discord user');
    err.status = 401;
    err.code = 'OAUTH_FAILED';
    throw err;
  }
  return res.json();
}

async function fetchUserGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const err = new Error('Failed to fetch Discord guilds');
    err.status = 401;
    err.code = 'OAUTH_FAILED';
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
  fetchUser,
  fetchUserGuilds,
  canManageGuild,
  DISCORD_API
};
