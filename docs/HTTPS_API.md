# OmniBot API HTTPS (for GitHub Pages dashboard)

## Problem

The production dashboard is served over **HTTPS**:

`https://yoshi507.github.io/Omnibot-dashboard/`

Browsers **block** `fetch()` from an HTTPS page to a plain **HTTP** API (mixed content).

Simply changing the dashboard URL from `http://` to `https://` does **not** work unless the API process is actually speaking TLS.

## Verified on production host

| Probe | Result |
|-------|--------|
| `http://78.154.103.20:13893/health` | **200 OK** (plain HTTP) |
| `https://78.154.103.20:13893/health` | **Fails** — OpenSSL `wrong version number` (port is not TLS) |

So port **13893 currently has no HTTPS**.

## How to enable real HTTPS on OmniBot

1. Obtain a TLS certificate for a hostname that points at your Wispbyte instance
   (Let's Encrypt, Cloudflare, or your host's certificate product).
2. On the bot host, set environment variables:

```bash
SSL_KEY_PATH=/path/to/privkey.pem
SSL_CERT_PATH=/path/to/fullchain.pem
PORT=13893   # or whatever Wispbyte assigns
```

3. Restart OmniBot. Logs should show:

`OmniBot API listening with HTTPS on 0.0.0.0:<port>`

4. Confirm:

```bash
curl -sS https://YOUR_HOSTNAME:PORT/health
```

5. Update the **dashboard GitHub Actions** workflow build env:

```yaml
VITE_API_BASE_URL: https://YOUR_HOSTNAME:PORT
```

(or the HTTPS URL your reverse proxy exposes), then redeploy Pages.

## Alternatives (no cert on the bot)

- **Reverse proxy** (nginx / Caddy / Cloudflare Tunnel) terminates TLS and proxies to `http://127.0.0.1:$PORT`.
- **Same-origin dashboard**: open the UI from the API host (HTTP page → HTTP API). OmniBot can serve a built dashboard from `public/dashboard`.

## Do not

- Change only the scheme in the frontend to `https://` while the API remains HTTP.
- Commit private keys or certificates to GitHub.
