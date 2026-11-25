# Project Rules & Test-Driven Repair Protocol

## Environment & Commands
- **Test Command**: `pnpm exec playwright test` (runs the `sqlite` project; specs live in `tests/e2e/`)
- **Single Test**: `pnpm exec playwright test <path-to-test>`
- **Database**: SQLite, a fresh unique file per run in the OS temp dir (`playwright.config.ts` sets `DB_STORAGE_PATH`). Do NOT use `:memory:` — Sequelize's connection pool gives each connection a private empty DB, which breaks login. Never write SQLite files into the repo.
- **Ports**: The API port is `process.env.PORT` (default 3005) and the Vite client port is `process.env.CLIENT_PORT` (default 5173), both injected by the orchestrator. Never hardcode ports; use `API_URL` from `tests/e2e/fixtures.ts` or `baseURL`.
- **Full suite only for bigger-than-minor changes**: run the full suite (`pnpm exec playwright test`) only when the change is larger than a minor one (new/changed architecture, shared code, many files, a major or minor version bump). For a minor change or patch, run only the specs of the areas the work touched.
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
   - Write a new Playwright test under `tests/e2e/reproductions/` reproducing the issue.
   - Run the test (`pnpm exec playwright test tests/e2e/reproductions/<test_name>`).
   - The test **must fail** with an assertion error. If it passes or fails due to syntax/import errors, refine it until it accurately reproduces the bug.
2. **Step 2 - Minimal Root-Cause Patch**:
   - Locate the defect in the source code.
   - Apply the minimal change required to fix the issue.
   - Do NOT perform refactoring or touch unrelated files.
3. **Step 3 - Verify Fix**:
   - Rerun the reproduction test. Confirm that it passes.
4. **Step 4 - Regression Guard**:
   - Run the full test suite (`pnpm exec playwright test`).
   - Confirm all existing tests continue to pass.
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
- To raise the minor/major, edit `version` in root `package.json` (`chore: release X.Y.0`). Electron releases trigger on an `X.Y.0` bump on master.
- After pushing, check the Actions run is green and the tag exists on Docker Hub; if the workflow lacks the "Compute version" step, the tag will not appear.
