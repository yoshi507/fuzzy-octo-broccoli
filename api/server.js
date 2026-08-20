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
const personaRoutes = require('./routes/persona');
const featuresRoutes = require('./routes/features');

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
        } catch {}
        return callback(null, false);
      },
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  app.use(express.json({ limit: '6mb' }));

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, code: 'RATE_LIMIT', message: 'Too many requests' }
  });
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, code: 'RATE_LIMIT', message: 'Too many auth requests' }
  });

  app.use(generalLimiter);

  app.get('/health', (req, res) => {
    const client = req.app.locals.discordClient;
    res.json({
      ok: true,
      botReady: Boolean(client?.readyAt || client?.ws),
      guilds: client?.guilds?.cache?.size ?? 0,
      tls: Boolean(loadTlsOptions()),
      timestamp: new Date().toISOString()
    });
  });

  app.use('/auth', authLimiter, authRoutes);
  app.use('/guilds', guildRoutes);
  app.use('/guilds/:guildId/settings', settingsRoutes);
  app.use('/guilds/:guildId/persona', personaRoutes);
  app.use('/guilds/:guildId/bot', botRouter);
  app.use('/guilds/:guildId/stats', statsRouter);
  app.use('/guilds/:guildId/features', featuresRoutes);
  app.use('/appeals', publicAppealsRoutes);

  const dashDir = path.resolve(__dirname, '../public/dashboard');
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

function startApiServer(discordClient) {
  if (activeApp && discordClient) {
    activeApp.locals.discordClient = discordClient;
  }
  if (activeServer) return activeServer;

  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) {
    console.warn('⚠️ API server not started: set PORT environment variable.');
    return null;
  }

  try {
    activeApp = createApiApp(discordClient);
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
  if (activeApp) activeApp.locals.discordClient = discordClient;
}

module.exports = { startApiServer, createApiApp, setDiscordClient, loadTlsOptions };
