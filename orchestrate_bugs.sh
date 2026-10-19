#!/usr/bin/env bash
set -euo pipefail

MAIN_REPO_DIR=$(pwd)
WORKTREES_BASE="$(cd .. && pwd)/worktrees_workspace"
ISSUES_FILE="bugs_queue.json"

if [ ! -f "$ISSUES_FILE" ]; then
  echo "Error: $ISSUES_FILE not found."
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "jq is required. Aborting."; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh CLI is required. Aborting."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required. Aborting."; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "claude CLI is required. Aborting."; exit 1; }

mkdir -p "$WORKTREES_BASE"

# Allocate a free port from the OS kernel
get_free_port() {
  node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})'
}

BASE_SHA=$(git rev-parse HEAD)
echo "Starting autonomous bug-fixing pipeline from $BASE_SHA..."
echo "Note: worktrees branch from the last commit; uncommitted changes are NOT included."

process_bug() {
  local issue="$1"
  local BUG_ID TITLE DESC BRANCH TARGET_WORKTREE PORT CLIENT_PORT
  BUG_ID=$(echo "$issue" | jq -r '.id')
  TITLE=$(echo "$issue" | jq -r '.title')
  DESC=$(echo "$issue" | jq -r '.description')
  BRANCH="fix/$BUG_ID"
  TARGET_WORKTREE="$WORKTREES_BASE/$BUG_ID"
  PORT=$(get_free_port)
  CLIENT_PORT=$(get_free_port)

  echo "=========================================================="
  echo "Processing: $BUG_ID - $TITLE"
  echo "API port: $PORT  Client port: $CLIENT_PORT"
  echo "Worktree: $TARGET_WORKTREE"
  echo "=========================================================="

  git worktree add -b "$BRANCH" "$TARGET_WORKTREE" "$BASE_SHA"

  (
    cd "$TARGET_WORKTREE"

    # Link node_modules from the main repo (root, server, client) to skip reinstalling
    for d in . server client; do
      if [ -d "$MAIN_REPO_DIR/$d/node_modules" ] && [ ! -e "$d/node_modules" ]; then
        ln -s "$MAIN_REPO_DIR/$d/node_modules" "$d/node_modules"
      fi
    done

    AGENT_PROMPT="You are resolving $BUG_ID: '$TITLE'.
Issue details: $DESC
Operational parameters:
- API port: $PORT (process.env.PORT), client port: $CLIENT_PORT (process.env.CLIENT_PORT)
- Database: fresh temporary SQLite file per run (see CLAUDE.md; never :memory:)

Follow the Fail-to-Pass protocol in CLAUDE.md:
1. Write an end-to-end Playwright test under tests/e2e/reproductions/${BUG_ID}.spec.ts reproducing the bug.
2. Run 'PORT=$PORT CLIENT_PORT=$CLIENT_PORT npx playwright test tests/e2e/reproductions/${BUG_ID}.spec.ts' and confirm it FAILS.
3. Fix the bug in the source code with a minimal patch.
4. Rerun that command and confirm it PASSES.
5. Run 'PORT=$PORT CLIENT_PORT=$CLIENT_PORT npx playwright test' to verify no regressions.
6. Stage only the changed files and the new test, then commit with message \"fix($BUG_ID): $TITLE\"."

    # stdin from /dev/null so claude doesn't swallow the queue being read by the loop
    PORT="$PORT" CLIENT_PORT="$CLIENT_PORT" claude -p "$AGENT_PROMPT" --dangerously-skip-permissions </dev/null

    if [ "$(git rev-parse HEAD)" = "$BASE_SHA" ]; then
      echo "No commit produced for $BUG_ID; skipping PR."
      exit 0
    fi

    echo "Pushing branch $BRANCH..."
    git push -u origin "$BRANCH"

    echo "Creating Pull Request..."
    gh pr create \
      --title "fix($BUG_ID): $TITLE" \
      --body "### Autonomous Fix for $BUG_ID
**Title:** $TITLE
**Details:** $DESC

Produced by the F2P pipeline: reproducing test added under tests/e2e/reproductions, failing before / passing after the fix, then the full suite run (sqlite, isolated temp DB). Please verify in CI before merging."
  )
}

# fd 3 carries the queue so nothing inside the loop can consume it
while IFS= read -r issue <&3; do
  if ! process_bug "$issue" </dev/null; then
    echo "FAILED: $(echo "$issue" | jq -r '.id') — continuing with next bug."
  fi
  BUG_ID=$(echo "$issue" | jq -r '.id')
  git worktree remove "$WORKTREES_BASE/$BUG_ID" --force 2>/dev/null || true
  echo "Cleaned worktree for $BUG_ID."
done 3< <(jq -c '.[]' "$ISSUES_FILE")

echo "All bugs processed."
