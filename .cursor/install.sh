#!/usr/bin/env bash
# Idempotent install for the Reqspace Cloud Agent environment.
# Installs MongoDB (the app's canonical DB), Node dependencies for the
# server / client / root workspaces, Playwright's Chromium, and builds
# both the client and the server.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── MongoDB (system package) ────────────────────────────────────────────────
# Reqspace's default/tested database is MongoDB (the DB_TYPE default and the
# database the Playwright/global-setup harness targets). Install the community
# server + shell from MongoDB's official apt repo if not already present.
if ! command -v mongod >/dev/null 2>&1; then
  echo "Installing MongoDB 8.0 ..."
  curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y mongodb-org-server mongodb-mongosh
else
  echo "MongoDB already installed: $(mongod --version | head -1)"
fi

mkdir -p "$REPO_ROOT/.data/mongodb"

# ── Node dependencies ───────────────────────────────────────────────────────
echo "Installing server dependencies ..."
npm ci --prefix server

echo "Installing client dependencies ..."
npm ci --prefix client

# Root deps provide the Playwright test runner (tests/ live at the repo root).
# Electron is only needed for desktop packaging, so skip its heavy binary
# download in the cloud environment.
echo "Installing root (test-runner) dependencies ..."
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci

# ── Playwright browser ──────────────────────────────────────────────────────
echo "Installing Playwright Chromium ..."
npx --yes playwright install --with-deps chromium

# ── Build client + server ───────────────────────────────────────────────────
echo "Building client ..."
npm run build --prefix client

echo "Building server ..."
npm run build --prefix server

echo "Install complete."
