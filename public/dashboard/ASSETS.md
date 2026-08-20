# Dashboard static assets

This folder must contain a full Vite `build:same-origin` output:

```
public/dashboard/
  index.html
  favicon.svg
  assets/
    index-*.js
    index-*.css
```

Build and copy from the Omnibot-dashboard repo:

```bash
cd Omnibot-dashboard
npm install
npm run build:same-origin
rm -rf ../fuzzy-octo-broccoli/public/dashboard/*
cp -a dist/. ../fuzzy-octo-broccoli/public/dashboard/
git add public/dashboard
git commit -m "Sync same-origin dashboard build"
git push
```

Then restart OmniBot on Wispbyte.

Open: http://YOUR_HOST:PORT/
