# Project Rules & Test-Driven Repair Protocol

## Environment & Commands
- **Test Command**: `pnpm exec playwright test` (runs the `sqlite` project; specs live in `tests/e2e/`)
- **Single Test**: `pnpm exec playwright test <path-to-test>`
- **Database**: SQLite, a fresh unique file per run in the OS temp dir (`playwright.config.ts` sets `DB_STORAGE_PATH`). Do NOT use `:memory:` — Sequelize's connection pool gives each connection a private empty DB, which breaks login. Never write SQLite files into the repo.
- **Ports**: The API port is `process.env.PORT` (default 3005) and the Vite client port is `process.env.CLIENT_PORT` (default 5173), both injected by the orchestrator. Never hardcode ports; use `API_URL` from `tests/e2e/fixtures.ts` or `baseURL`.
- **Run only the affected world**: after any change, run only the spec folder (`tests/e2e/<world>/`) and the part (spec/test) the change touched, never the whole suite by default.
- **Full e2e suite requires the user's approval**: before running the full suite (`pnpm exec playwright test` with no path), ask the user with AskUserQuestion and run it only after they approve.
- **E2E runs on sqlite only** (locally and in CI). No bug has ever come from a different DB engine, so the Playwright step in `.github/workflows/test.yml` is skipped for postgres/mysql; those matrix jobs still run the server jest tests and `scripts/smoke-core.sh`. Never run `--project=postgres|mysql` locally.
- Headless only. Every test fails if it leaves new rows in the `fperrors` table (see `tests/e2e/fixtures.ts`).

## Worktrees: share `node_modules` with the parent checkout
- A worktree (`.claude/worktrees/<name>`) has no `node_modules`. Never run `pnpm install` in it (native `better-sqlite3` fails to build). Instead, junction the three folders to the parent checkout `C:\projects\reqspace` (PowerShell, from the worktree root):
  ```powershell
  foreach ($d in 'node_modules','server\node_modules','client\node_modules') {
    if (-not (Test-Path $d)) { cmd /c mklink /J $d "C:\projects\reqspace\$d" }
  }
  ```
- Remove a junction with `cmd /c rmdir <path>` (never `rm -rf` / `Remove-Item -Recurse`, which would delete the parent's packages). They are git-ignored, so they are never committed.
- Do this once, right after entering a new worktree, before any `tsc` or test run.

## Mandatory Fail-to-Pass (F2P) Bug-Fixing Cycle
For every assigned bug, you MUST adhere to the following sequence:

1. **Step 1 - Reproducing Test First**:
   - Write a new Playwright test in the matching world folder under `tests/e2e/<world>/` (see `docs/plans/e2e-worlds.md`) reproducing the issue; add it to the existing spec of that area when one fits.
   - Run the test (`pnpm exec playwright test tests/e2e/<world>/<test_name>`).
   - The test **must fail** with an assertion error. If it passes or fails due to syntax/import errors, refine it until it accurately reproduces the bug.
2. **Step 2 - Minimal Root-Cause Patch**:
   - Locate the defect in the source code.
   - Apply the minimal change required to fix the issue.
   - Do NOT perform refactoring or touch unrelated files.
3. **Step 3 - Verify Fix**:
   - Rerun the reproduction test. Confirm that it passes.
4. **Step 4 - Regression Guard**:
   - Run the affected world's specs (`tests/e2e/<world>/`); run the full suite only with the user's approval (see Environment & Commands).
   - Confirm all existing tests in them continue to pass.
5. **Step 5 - Commit**:
   - Stage modified files and the new test only.
   - Commit with message: `fix(<BUG_ID>): <concise description>`.


## Token-saving mode: ponytail
- The `ponytail` skill (project copy in `.claude/skills/`, from github.com/DietrichGebert/ponytail, MIT) makes replies short and prefers the smallest change that fully works: stdlib and existing code first, no unrequested abstractions.
- Use it on coding tasks (`/ponytail`, levels `lite|full|ultra`, `/ponytail off` to stop). Companions: `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`.
- It never overrides the rules above: the F2P bug-fixing cycle (reproduction test first, minimal patch, full suite, commit message format) still applies in full.
- Only the skills are installed; the plugin hooks (per-prompt injection, ledger, webhook) are deliberately not.

## Docker Hub version tag
- Every push (any branch) must publish a version tag to Docker Hub (`itayp/reqspace`), not just `latest`/branch/sha. `.github/workflows/docker-publish.yml` does it: `<major>.<minor>` from root `package.json` + `.<github.run_number>`, so the patch part rises automatically on every push.
- It also publishes the exact `package.json` version (e.g. `1.6.4`), so always bump the fix number in `package.json` before pushing.
- **Before EVERY `git push` (any branch, even a small follow-up or a docs/test-only commit):** bump the patch of `version` in root `package.json`, commit it, then push. Check `git show origin/dev:package.json` first so the number is higher than what is already on the remote; afterwards confirm local and `origin/dev` show the same version.
- To raise the minor/major, edit `version` in root `package.json` (`chore: release X.Y.0`). Electron releases trigger on an `X.Y.0` bump on master.
- After pushing, check the Actions run is green and the tag exists on Docker Hub; if the workflow lacks the "Compute version" step, the tag will not appear.

## Finishing a worktree or branch
- Whenever work in a worktree or branch is finished: merge it into `dev` and push `dev`. Do this every time, without being asked.
- `master` only when the user asks for it. Never merge or push `master` on your own; if unsure, ask with the AskUserQuestion tool (interactive), not in plain text.
- Before the commit and push that promotes work to `dev`, bump the fix (patch) number of `version` in root `package.json` (e.g. `1.5.0` -> `1.5.1`).
