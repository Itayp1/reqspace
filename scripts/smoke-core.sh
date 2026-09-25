#!/usr/bin/env bash
# Core smoke test: exercises the primary user journey end-to-end against a
# running server, crossing the authentication boundary (register/login is not
# enough — see TESTING.md). Intended to run in CI against a fresh server on any backend.
#
# Usage: scripts/smoke-core.sh [BASE_URL]   (default http://localhost:3005)
set -euo pipefail

B="${1:-http://localhost:3005}"
J="$(mktemp)"
trap 'rm -f "$J"' EXIT

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; exit 1; }
jqid() { python3 -c 'import sys,json;print(json.load(sys.stdin)["_id"])'; }

# 1. login with the seeded default admin (fresh server) — must force a change
r=$(curl -s -c "$J" -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin","password":"admin"}')
echo "$r" | grep -q '"mustChangePassword":true' && pass "login (forced change)" || fail "login: $r"

# 2. FIRST AUTHENTICATED CALL — the one that 500'd on SQL before CR#1
r=$(curl -s -b "$J" "$B/api/auth/me"); echo "$r" | grep -q '"isSuperAdmin":true' && pass "GET /me (authenticated)" || fail "me: $r"

# 3. forced password change
curl -s -b "$J" -c "$J" -X POST "$B/api/auth/change-password" -H 'Content-Type: application/json' \
  -d '{"newPassword":"CiSmoke!2026"}' | grep -q "successfully" && pass "change-password" || fail "change-password"

# 4. workspace -> collection -> folder -> request (ids round-trip: ObjectId or UUID)
WS=$(curl -s -b "$J" -X POST "$B/api/workspaces" -H 'Content-Type: application/json' -d '{"name":"SmokeWS"}' | jqid); [ -n "$WS" ] && pass "create workspace" || fail "workspace"
curl -s -b "$J" "$B/api/workspaces" | grep -q "SmokeWS" && pass "list workspaces" || fail "list workspaces"
C=$(curl -s -b "$J" -X POST "$B/api/workspaces/$WS/collections" -H 'Content-Type: application/json' -d '{"name":"SmokeC"}' | jqid); [ -n "$C" ] && pass "create collection" || fail "collection"
F=$(curl -s -b "$J" -X POST "$B/api/collections/$C/folders" -H 'Content-Type: application/json' -d '{"name":"SmokeF"}' | jqid); [ -n "$F" ] && pass "create folder" || fail "folder"
RQ=$(curl -s -b "$J" -X POST "$B/api/collections/$C/requests" -H 'Content-Type: application/json' -d "{\"name\":\"SmokeR\",\"method\":\"GET\",\"url\":\"https://example.com\",\"folderId\":\"$F\"}" | jqid); [ -n "$RQ" ] && pass "create request" || fail "request"

# 5. read back, update, delete
curl -s -b "$J" "$B/api/collections/$C/requests" | grep -q "SmokeR" && pass "list requests" || fail "list requests"
curl -s -b "$J" -X PUT "$B/api/requests/$RQ" -H 'Content-Type: application/json' -d '{"name":"SmokeR2"}' | grep -q "SmokeR2" && pass "update request" || fail "update request"
curl -s -b "$J" -X DELETE "$B/api/requests/$RQ" | grep -q "deleted" && pass "delete request" || fail "delete request"
curl -s -b "$J" -X DELETE "$B/api/collections/$C" | grep -q "deleted" && pass "delete collection" || fail "delete collection"

# 6. logout clears the cookie with matching attributes
curl -s -i -b "$J" -X POST "$B/api/auth/logout" | grep -qi "set-cookie: token=;" && pass "logout clears cookie" || fail "logout"

echo "ALL CORE SMOKE CHECKS PASSED against $B"
