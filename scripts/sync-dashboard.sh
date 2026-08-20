#!/usr/bin/env bash
# Build the dashboard for same-origin hosting and copy into OmniBot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DASH="${DASHBOARD_DIR:-$ROOT/Omnibot-dashboard}"
BOT="${BOT_DIR:-$ROOT/fuzzy-octo-broccoli}"
if [[ ! -d "$DASH" ]]; then
  echo "Clone Omnibot-dashboard next to fuzzy-octo-broccoli or set DASHBOARD_DIR"
  exit 1
fi
cd "$DASH"
npm install
npm run build:same-origin
rm -rf "$BOT/public/dashboard"
mkdir -p "$BOT/public/dashboard"
cp -a dist/. "$BOT/public/dashboard/"
echo "Copied dashboard build to $BOT/public/dashboard"
ls -la "$BOT/public/dashboard"
