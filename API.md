# OmniBot Dashboard API

REST API that runs **in the same Node.js process as OmniBot** (Wispbyte).
The GitHub Pages dashboard talks to this API over HTTPS. Secrets never go to the frontend.

## Architecture

```
GitHub Pages Dashboard  →  HTTPS  →  OmniBot API (Express)  →  existing database / data files / Discord client
```

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | Yes (for API) | Listen port (Wispbyte injects this) |
| `DISCORD_TOKEN` | Yes | Bot token (existing) |
| `DISCORD_CLIENT_ID` | For OAuth | OAuth2 application client ID |
| `DISCORD_CLIENT_SECRET` | For OAuth | OAuth2 secret (**server only**) |
| `DISCORD_REDIRECT_URI` | Recommended | Must match Discord portal + dashboard |
| `DASHBOARD_ORIGINS` | Optional | Comma-separated allowed CORS origins |
| `GROQ_API_KEY` | Optional | Existing AI key |
| `SESSION_SECRET` | Optional | Reserved for future signed cookies |

Copy names from `.env.example`. **Never commit `.env`.**

## Endpoints

### Health
- `GET /health` → `{ ok, botReady, guilds, timestamp }` (public)

### Auth
- `POST /auth/callback` body `{ code, redirectUri }` → `{ accessToken, expiresAt, user }`
- `GET /auth/me` (Bearer) → user
- `POST /auth/logout` (Bearer) → 204

### Guilds (Bearer + Manage Guild / Admin verified server-side)
- `GET /guilds`
- `GET /guilds/:guildId`
- `GET /guilds/:guildId/channels`
- `GET /guilds/:guildId/roles`

### Settings (Bearer + permission check)
- `GET /guilds/:guildId/settings` → flat map of settingId → value
- `PUT /guilds/:guildId/settings` body `{ patch: { settingId: value } }`
- `GET /guilds/:guildId/settings/history`

### Bot / stats
- `GET /guilds/:guildId/bot`
- `GET /guilds/:guildId/stats`

Authorization header: `Authorization: Bearer <accessToken>` from `/auth/callback`.

## Security notes

- Guild access is **never** trusted from the client alone; Discord guild list + permission bits + bot membership are checked on the server.
- CORS allows configured dashboard origins only.
- Rate limits: general 300/15min; auth 40/15min.
- Errors are JSON without stack traces or secrets.

## Wispbyte

1. Set env vars in the panel (including `PORT`).
2. Start command: `node index.js` (or `npm start`).
3. API starts when the Discord client is ready.
4. Point the dashboard `VITE_API_BASE_URL` at your Wispbyte HTTPS URL.

## Discord Developer Portal

1. Create application → OAuth2.
2. Redirect URL = dashboard origin (e.g. `https://yoshi507.github.io/Omnibot-dashboard/`).
3. Scopes: `identify`, `guilds`.
4. Put Client ID + Secret only in bot env on Wispbyte.
