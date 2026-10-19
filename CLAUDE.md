# Project Rules & Test-Driven Repair Protocol

## Environment & Commands
- **Test Command**: `npx playwright test` (runs the `sqlite` project; specs live in `tests/e2e/`)
- **Single Test**: `npx playwright test <path-to-test>`
- **Database**: SQLite, a fresh unique file per run in the OS temp dir (`playwright.config.ts` sets `DB_TYPE=sqlite` and `DB_STORAGE_PATH`). Do NOT use `:memory:` — Sequelize's connection pool gives each connection a private empty DB, which breaks login. Never write SQLite files into the repo.
- **Ports**: The API port is `process.env.PORT` (default 3005) and the Vite client port is `process.env.CLIENT_PORT` (default 5173), both injected by the orchestrator. Never hardcode ports; use `API_URL` from `tests/e2e/fixtures.ts` or `baseURL`.
- Headless only. Every test fails if it leaves new rows in the `fperrors` table (see `tests/e2e/fixtures.ts`).

## Mandatory Fail-to-Pass (F2P) Bug-Fixing Cycle
For every assigned bug, you MUST adhere to the following sequence:

1. **Step 1 - Reproducing Test First**:
   - Write a new Playwright test under `tests/e2e/reproductions/` reproducing the issue.
   - Run the test (`npx playwright test tests/e2e/reproductions/<test_name>`).
   - The test **must fail** with an assertion error. If it passes or fails due to syntax/import errors, refine it until it accurately reproduces the bug.
2. **Step 2 - Minimal Root-Cause Patch**:
   - Locate the defect in the source code.
   - Apply the minimal change required to fix the issue.
   - Do NOT perform refactoring or touch unrelated files.
3. **Step 3 - Verify Fix**:
   - Rerun the reproduction test. Confirm that it passes.
4. **Step 4 - Regression Guard**:
   - Run the full test suite (`npx playwright test`).
   - Confirm all existing tests continue to pass.
5. **Step 5 - Commit**:
   - Stage modified files and the new test only.
   - Commit with message: `fix(<BUG_ID>): <concise description>`.
