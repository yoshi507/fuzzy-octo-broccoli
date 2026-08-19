const assert = require('assert');
const http = require('http');
const { createApiApp } = require('../server');
const { createSession } = require('../services/sessions');
const { getGuildSettings, applyPatch } = require('../services/settingsBridge');
const { SETTINGS } = require('../config/settingsRegistry');

const GUILD_ID = '1532634792246509618';
const FAKE_GUILD = {
  id: GUILD_ID,
  name: 'Test Guild',
  memberCount: 42,
  channels: {
    cache: new Map([
      ['3001', { id: '3001', name: 'general', type: 0, isTextBased: () => true, isVoiceBased: () => false }]
    ])
  },
  roles: {
    cache: new Map([
      [GUILD_ID, { id: GUILD_ID, name: '@everyone', color: 0 }],
      ['4001', { id: '4001', name: 'Admin', color: 0xff0000 }]
    ])
  }
};

const mockClient = {
  readyAt: new Date(),
  uptime: 60000,
  ws: { ping: 33 },
  guilds: {
    cache: {
      size: 1,
      has: (id) => id === GUILD_ID,
      get: (id) => (id === GUILD_ID ? FAKE_GUILD : undefined)
    }
  }
};

function request(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const app = createApiApp(mockClient);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;

  try {
    const health = await request(port, 'GET', '/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.ok, true);
    console.log('OK health');

    for (const path of ['/auth/me', '/guilds', `/guilds/${GUILD_ID}/settings`]) {
      const res = await request(port, 'GET', path);
      assert.strictEqual(res.status, 401);
    }
    console.log('OK unauthenticated denied');

    const oauth = await request(port, 'POST', '/auth/callback', {
      body: { code: 'x', redirectUri: 'https://example.com' }
    });
    assert.strictEqual(oauth.status, 503);
    assert.strictEqual(oauth.body.code, 'OAUTH_NOT_CONFIGURED');
    console.log('OK oauth without secrets fails safely');

    const session = createSession({
      user: { id: '1', username: 'tester', global_name: 'Tester', avatar: null, discriminator: '0' },
      discordAccessToken: 'invalid-discord-token'
    });
    const me = await request(port, 'GET', '/auth/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    });
    assert.strictEqual(me.status, 200);
    console.log('OK /auth/me with session');

    const all = getGuildSettings(GUILD_ID);
    for (const def of SETTINGS) {
      assert.ok(Object.prototype.hasOwnProperty.call(all, def.id), def.id);
    }
    console.log('OK all settings present on read');

    let threw = false;
    try { applyPatch(GUILD_ID, { 'ai.dailyLimit': 99999 }, { username: 't' }); } catch (e) { threw = e.code === 'VALIDATION'; }
    assert.ok(threw);
    console.log('OK invalid settings rejected');

    const corsOk = await request(port, 'GET', '/health', {
      headers: { Origin: 'https://yoshi507.github.io' }
    });
    assert.strictEqual(corsOk.headers['access-control-allow-origin'], 'https://yoshi507.github.io');
    console.log('OK CORS allows dashboard origin');

    const corsBad = await request(port, 'GET', '/health', {
      headers: { Origin: 'https://evil.example' }
    });
    assert.ok(corsBad.headers['access-control-allow-origin'] !== 'https://evil.example');
    console.log('OK CORS blocks unknown origin');

    const nf = await request(port, 'GET', '/nope');
    assert.strictEqual(nf.status, 404);
    console.log('OK 404 shape');

    console.log('\nAll integration tests passed');
  } finally {
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
