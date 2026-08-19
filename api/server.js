const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const { router: guildRoutes } = require('./routes/guilds');
const settingsRoutes = require('./routes/settings');
const { botRouter, statsRouter } = require('./routes/bot');
const { notFound, errorHandler } = require('./middleware/errors');

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

function startApiServer(discordClient) {
  const app = express();
  app.locals.discordClient = discordClient;
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

  app.get('/health', (req, res) => {
    const client = discordClient;
    res.json({
      ok: true,
      botReady: Boolean(client?.readyAt),
      guilds: client?.guilds?.cache?.size ?? 0,
      timestamp: new Date().toISOString()
    });
  });

  app.use('/auth', authLimiter, authRoutes);
  app.use('/guilds', guildRoutes);
  app.use('/guilds/:guildId/settings', settingsRoutes);
  app.use('/guilds/:guildId/bot', botRouter);
  app.use('/guilds/:guildId/stats', statsRouter);

  app.use(notFound);
  app.use(errorHandler);

  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) {
    console.warn('⚠️ API server not started: set PORT environment variable for the dashboard API (Wispbyte provides this).');
    return null;
  }

  const server = app.listen(port, () => {
    console.log(`🌐 OmniBot API listening on port ${port}`);
  });

  return server;
}

module.exports = { startApiServer };
