# Sync dashboard into OmniBot

```bash
cd Omnibot-dashboard
npm install
npm run build:same-origin
rm -rf ../fuzzy-octo-broccoli/public/dashboard/*
cp -a dist/. ../fuzzy-octo-broccoli/public/dashboard/
```

Commit and push `fuzzy-octo-broccoli` so Wispbyte receives `public/dashboard`.

Discord Developer Portal → OAuth2 → Redirects must include:

`http://78.154.103.20:13893/`
