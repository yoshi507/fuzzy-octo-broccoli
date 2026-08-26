const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const authRoutes = require('./routes/auth');
const { router: guildRoutes } = require('./routes/guilds');
const settingsRoutes = require('./routes/settings');
const { botRouter, statsRouter } = require('./routes/bot');
const { notFound, errorHandler } = require('./middleware/errors');
const publicAppealsRoutes = require('./routes/publicAppeals');
const publicAdvertiseRoutes = require('./routes/publicAdvertise');
const personaRoutes = require('./routes/persona');
const featuresRoutes = require('./routes/features');
const advisorRoutes = require('./routes/advisor');

let activeServer = null;
let activeApp = null;

function parseAllowedOrigins() {
  const raw = process.env.DASHBOARD_ORIGINS || process.env.DASHBOARD_ORIGIN || '';
  const defaults = [
    'https://yoshi507.github.io',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://78.154.103.20:13893'
  ];
  const fromEnv = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...defaults, ...fromEnv])];
}

function loadTlsOptions() {
  const keyPath = process.env.SSL_KEY_PATH || process.env.TLS_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH || process.env.TLS_CERT_PATH;
  if (!keyPath || !certPath) return null;
  try {
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      console.warn('[API] SSL_KEY_PATH / SSL_CERT_PATH set but file(s) missing — starting HTTP only.');
      return null;
    }
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  } catch (err) {
    console.warn('[API] Failed to load TLS files — starting HTTP only:', err?.message || err);
    return null;
  }
}

function createApiApp(discordClient) {
  const app = express();
  app.locals.discordClient = discordClient || null;
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const allowedOrigins = parseAllowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        try {
          const u = new URL(origin);
          if (u.hostname === 'yoshi507.github.io') return callback(null, true);
          if (u.hostname.endsWith('.wisp.uno')) return callback(null, true);
        } catch (_) {}
        return callback(null, false);
      },
      credentials: true
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);

  app.get('/health', (req, res) => {
    const client = req.app.locals.discordClient || global.__omnibotClient || null;
    res.json({
      ok: true,
      service: 'OmniBot API',
      discordReady: Boolean(
        client &&
          (typeof client.isReady === 'function' ? client.isReady() : client.readyAt)
      ),
      guilds: client?.guilds?.cache?.size ?? 0,
      uptime: process.uptime()
    });
  });

  // Deploy diagnostic — open https://omnibot.wisp.uno/version after git pull + restart
  app.get('/version', (req, res) => {
    const commandsPath = path.join(__dirname, '../commands');
    let commandFiles = [];
    try {
      commandFiles = fs
        .readdirSync(commandsPath)
        .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
        .map((f) => f.replace(/\.js$/, ''))
        .sort();
    } catch (_) {}
    const features = ['swearjar', 'automation', 'captcha', 'userphone', 'forumhelp'];
    const featurePresent = {};
    for (const n of features) featurePresent[n] = commandFiles.includes(n);
    let diskOk = true;
    let diskError = null;
    try {
      const probe = path.join(process.cwd(), '.omnibot-disk-probe');
      fs.writeFileSync(probe, String(Date.now()));
      fs.unlinkSync(probe);
    } catch (e) {
      diskOk = false;
      diskError = e?.code || e?.message || String(e);
    }
    const client = req.app.locals.discordClient || global.__omnibotClient || null;
    res.json({
      ok: true,
      deployMarker: '2026-08-26-feature-pack-v2',
      service: 'OmniBot API',
      uptime: process.uptime(),
      node: process.version,
      discordReady: Boolean(
        client &&
          (typeof client.isReady === 'function' ? client.isReady() : client.readyAt)
      ),
      guilds: client?.guilds?.cache?.size ?? 0,
      commandFileCount: commandFiles.length,
      featureCommands: featurePresent,
      featureCommandsMissing: features.filter((n) => !featurePresent[n]),
      groqConfigured: Boolean(
        process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ_TOKEN
      ),
      diskWriteOk: diskOk,
      diskError,
      dashboardUrl: 'https://omnibot.wisp.uno'
    });
  });

  app.use('/auth', authRoutes);
  app.use('/guilds', guildRoutes);
  app.use('/guilds/:guildId/settings', settingsRoutes);
  app.use('/guilds/:guildId/persona', personaRoutes);
  app.use('/guilds/:guildId/features', featuresRoutes);
  app.use('/guilds/:guildId/advisor', advisorRoutes);
  app.use('/guilds/:guildId/bot', botRouter);
  app.use('/guilds/:guildId/stats', statsRouter);
  app.use('/appeals', publicAppealsRoutes);
  app.use('/public/appeals', publicAppealsRoutes);
  app.use('/advertise', publicAdvertiseRoutes);
  app.use('/public/advertise', publicAdvertiseRoutes);

  const dashDir = path.join(__dirname, '../public/dashboard');

  function sendDashboardFile(res, fileName) {
    const filePath = path.join(dashDir, fileName);
    if (fs.existsSync(filePath)) {
      return res.sendFile(path.resolve(filePath));
    }
    return res.status(404).type('text').send('Not found');
  }

  app.get(['/tos', '/tos/', '/terms', '/terms/', '/terms-of-service', '/terms-of-service/'], (req, res) => {
    return sendDashboardFile(res, 'tos.html');
  });
  app.get(['/privacy-policy', '/privacy-policy/', '/privacy', '/privacy/'], (req, res) => {
    return sendDashboardFile(res, 'privacy-policy.html');
  });

  app.get('/', (req, res) => {
    const index = path.join(dashDir, 'index.html');
    if (fs.existsSync(index)) return res.sendFile(path.resolve(index));
    res.json({ ok: true, service: 'OmniBot API', health: '/health' });
  });
  if (fs.existsSync(dashDir)) {
    app.use(express.static(dashDir, { index: false, fallthrough: true }));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

function resolveListenPort() {
  const candidates = [
    ['PORT', process.env.PORT],
    ['SERVER_PORT', process.env.SERVER_PORT],
    ['WEB_PORT', process.env.WEB_PORT],
    ['HTTP_PORT', process.env.HTTP_PORT],
    ['APP_PORT', process.env.APP_PORT]
  ];
  for (const [name, raw] of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return { port: n, source: name };
    }
  }
  return { port: 13893, source: 'default:13893' };
}

function startMinimalHealthServer(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/health/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'OmniBot API (minimal)',
        discordReady: Boolean(global.__omnibotClient),
        uptime: process.uptime()
      }));
      return;
    }
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('OmniBot API is starting or in degraded mode. Retry shortly.');
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`🌐 OmniBot minimal health server on 0.0.0.0:${port}`);
  });
  server.on('error', (err) => {
    console.error('❌ Minimal API server error:', err?.code || err?.message || err);
  });
  return server;
}

function startApiServer(discordClient) {
  if (activeApp && discordClient) {
    activeApp.locals.discordClient = discordClient;
  }

  const early = global.__omnibotHttpServer;

  try {
    if (!activeApp) {
      activeApp = createApiApp(discordClient);
    } else if (discordClient) {
      activeApp.locals.discordClient = discordClient;
    }

    global.__omnibotAppHandler = function omnibotAppHandler(req, res) {
      return activeApp(req, res);
    };

    if (early && typeof early.listening === 'boolean') {
      activeServer = early;
      console.log('🌐 Express API attached to early web listener (dashboard + API routes live)');
      return activeServer;
    }

    if (activeServer) return activeServer;

    const { port, source } = resolveListenPort();
    console.log(`[API] Binding web server on port ${port} (source=${source}) host=0.0.0.0`);
    const tls = loadTlsOptions();
    if (tls) {
      activeServer = https.createServer(tls, activeApp);
      activeServer.listen(port, '0.0.0.0', () => {
        console.log(`🌐 OmniBot API listening with HTTPS on 0.0.0.0:${port}`);
      });
    } else {
      activeServer = http.createServer(activeApp);
      activeServer.listen(port, '0.0.0.0', () => {
        console.log(`🌐 OmniBot API listening on 0.0.0.0:${port} (HTTP — set SSL_KEY_PATH + SSL_CERT_PATH for HTTPS)`);
      });
    }
    activeServer.on('error', (err) => {
      console.error('❌ API server error:', err?.code || err?.message || err);
      if (err && err.code === 'EADDRINUSE') {
        console.error(`[API] Port ${port} already in use. Set PORT to the free port shown in the Wispbyte panel.`);
      }
    });
    try { global.__omnibotHttpServer = activeServer; } catch (_) {}
    return activeServer;
  } catch (err) {
    console.error('❌ Failed to start full API server:', err?.message || err);
    if (early) {
      console.warn('[API] Full Express failed — early static dashboard listener remains active.');
      return early;
    }
    try {
      const { port } = resolveListenPort();
      activeApp = null;
      activeServer = startMinimalHealthServer(port);
      try { global.__omnibotHttpServer = activeServer; } catch (_) {}
      return activeServer;
    } catch (err2) {
      console.error('❌ Minimal API fallback also failed:', err2?.message || err2);
      activeApp = null;
      activeServer = null;
      return null;
    }
  }
}

function setDiscordClient(discordClient) {
  try {
    if (discordClient) global.__omnibotClient = discordClient;
  } catch (_) {}
  if (activeApp) activeApp.locals.discordClient = discordClient || null;
}

module.exports = { startApiServer, createApiApp, setDiscordClient, loadTlsOptions };
