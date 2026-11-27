# E2E speed-up plan (target: full suite 60 min -> ~15-20 min)

Rules for the agent (read first):
- Do ONLY the first unchecked part below. One part = one commit (`perf(e2e): <part title>`), stage only files you changed.
- Test infra work, not a bug fix: no F2P cycle, but prove the part works (run the affected specs, or the command the part adds).
- Never touch `master`/`dev`, never bump version, never push. The human merges.
- When a part is done: tick its box, add 1-3 lines of result (numbers, file names) under it, commit, stop.
- If a part is blocked or not worth it, tick it as `[x] SKIPPED: <reason>` and stop. Do not improvise other work.
- NEVER run the full suite sequentially (it takes an hour). Run only touched specs, or the sharded `test:e2e:fast` (parts 2 and 8). Use `run_in_background` + wait, not polling.
- Never run `pnpm install` in a worktree; see CLAUDE.md for the node_modules junctions.

## Parts

- [ ] 0. Shared `storageState` (login once). Admin login once in global-setup (or a `setup` project), save to a temp-dir file, and set `use.storageState` for the specs that only need a logged-in user. Keep per-test login (`test.use({ storageState: { cookies: [], origins: [] } })`) for specs that log out, change passwords, register, use OAuth, or assume a clean user (auth*, ui/auth-forms, oauth-*, first-run-setup, login-session-cookie-blocked, QA-75). Watch the login rate limit (15/15min per IP). Prove it on 3-4 specs and record the time saved.
- [ ] 0b. Spec inventory (no running). Count the specs that actually run (the `sqlite` project ignores `extension` and `electron-app`; `postgres`/`mysql`/`electron`/`extension` are separate projects). Record in the baseline doc: files per folder, `test()` count, and how many use `page` vs only `request`. Measured on 2026-11-27: 192 spec files (119 in `tests/e2e/`, 64 in `reproductions/`, 9 in `ui/`), ~588 `test(` lines; `sqlite` runs 190 of them.
- [ ] 1. Baseline WITHOUT running tests. The old time is known: ~60 min sequential. Find the slowest spec files from data that already exists (latest `playwright-report*/`, `test-results*/`, any `*.json` report on disk). If none, list the 15 biggest spec files by line count and count `waitForTimeout`/`serial` per file. Write `docs/plans/e2e-speedup-baseline.md` (old total ~60 min, slow/big files). Do NOT run the suite.
- [ ] 2. Sharding for the browser suite. `scripts/run-e2e-targets.js --browser-only --shards=auto` already gives N isolated stacks (own ports + DB). Add npm script `test:e2e:fast` for it, run it, confirm all green, record wall time vs the ~60 min baseline (this is the first full run; use `--reporter=json` timings it already writes for per-file seconds). Fix only what breaks sharding (shared state between files, hardcoded ports).
- [x] 3. Login once: moved to part 0.
- [ ] 4. Remove dead time. Replace the ~29s of `waitForTimeout` (grep it) with `expect(...)`/`waitForResponse` conditions. Run the touched specs 3x each to confirm no new flakes.
- [ ] 5. API-only specs without a browser. List specs that never use the `page` fixture (only `request`). Move/tag them so they run with no browser launch (Playwright `request` fixture only), or a dedicated `api` project. Record the gain.
- [ ] 6. `@smoke` tag. Tag ~30 tests covering login, workspace, collection, send request, environments, history. Add `test:e2e:smoke` (`--grep @smoke`). Target < 5 min. Document in CLAUDE.md (Environment & Commands: smoke before merge to dev, full suite nightly/CI).
- [ ] 7. Duplicate repro tests. Under `tests/e2e/reproductions/` and `fix-*` specs, list ones whose assertions are already covered by the area spec. Delete only clear duplicates; list the doubtful ones in `docs/plans/e2e-speedup-baseline.md` for the human. Run the area specs after.
- [ ] 8. Final measurement. Run `test:e2e:fast` full, record the new total in the baseline doc next to the old one. Confirm no test depends on order.
