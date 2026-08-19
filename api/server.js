const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const { router: guildRoutes } = require('./routes/guilds');
const settingsRoutes = require('./routes/settings');
const { botRouter, statsRouter } = require('./routes/bot');
const { notFound, errorHandler } = require('./middleware/errors');

/** @type {import('http').Server | null} */
let activeServer = null;
/** @type {import('express').Express | null} */
let activeApp = null;

function parseAllowedOrigins() {
  const raw = process.env.DASHBOARD_ORIGINS || process.env.DASHBOARD_ORIGIN || '';
  const defaults = [
    'https://yoshi507.github.io',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
  const fromEnv = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...defaults, ...fromEnv])];
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
        } catch {}
        return callback(null, false);
      },
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  app.use(express.json({ limit: '32kb' }));

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, code: 'RATE_LIMITED', message: 'Too many auth attempts. Please try again later.' }
  });

  app.use(generalLimiter);

  function healthPayload(req) {
    const client = req.app.locals.discordClient;
    return {
      ok: true,
      service: 'omnibot',
      botReady: Boolean(client?.readyAt),
      guilds: client?.guilds?.cache?.size ?? 0,
      timestamp: new Date().toISOString()
    };
  }
  app.get('/', (req, res) => {
    res.status(200).json(healthPayload(req));
  });
  app.get('/health', (req, res) => {
    res.status(200).json(healthPayload(req));
  });

  app.use('/auth', authLimiter, authRoutes);
  app.use('/guilds', guildRoutes);
  app.use('/guilds/:guildId/settings', settingsRoutes);
  app.use('/guilds/:guildId/bot', botRouter);
  app.use('/guilds/:guildId/stats', statsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

function startApiServer(discordClient) {
  if (activeApp && discordClient) {
    activeApp.locals.discordClient = discordClient;
  }

  if (activeServer) {
    return activeServer;
  }

  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) {
    console.warn(
      '⚠️ API server not started: set PORT environment variable for the dashboard API (Wispbyte provides this).'
    );
    return null;
  }

  try {
    activeApp = createApiApp(discordClient);
    activeServer = activeApp.listen(port, '0.0.0.0', () => {
      console.log(`🌐 OmniBot API listening on 0.0.0.0:${port}`);
    });

    activeServer.on('error', (err) => {
      console.error('❌ API server error:', err?.code || err?.message || err);
      if (err && err.code === 'EADDRINUSE') {
        console.error('[DIAG] PORT already in use — another process may be bound to this port.');
      }
    });

    return activeServer;
  } catch (err) {
    console.error('❌ Failed to start API server:', err?.message || err);
    activeApp = null;
    activeServer = null;
    return null;
  }
}

function setDiscordClient(discordClient) {
  if (activeApp) {
    activeApp.locals.discordClient = discordClient;
  }
}

module.exports = { startApiServer, createApiApp, setDiscordClient };
