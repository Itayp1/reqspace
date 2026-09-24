#!/usr/bin/env bash
# Per-boot startup: bring up MongoDB and wait until it is ready.
# The Reqspace web server itself runs in the "server" terminal (see
# environment.json) so its logs stay visible and it can be restarted.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DBPATH="$REPO_ROOT/.data/mongodb"
LOGPATH="$REPO_ROOT/.data/mongod.log"
mkdir -p "$DBPATH"

# Start mongod only if it is not already listening on 27017 (idempotent).
if mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
  echo "MongoDB already running."
else
  echo "Starting mongod ..."
  mongod --dbpath "$DBPATH" --bind_ip 127.0.0.1 --port 27017 \
    --logpath "$LOGPATH" --fork
fi

# Wait for readiness (up to ~30s).
for i in $(seq 1 30); do
  if mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
    echo "MongoDB is ready."
    exit 0
  fi
  sleep 1
done

echo "MongoDB did not become ready in time." >&2
exit 1
