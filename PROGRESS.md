# Progress log

One line per completed task: date · id · what was done · files touched.

* 2026-09-26 · Task 0 · Fixed the broken server/client builds (duplicate `userId` in `index.ts`'s socket
  handler, three call sites left on the old array shape of `UserRepository.list()`/`WorkspaceRepository.list()`
  after PERF-3, the batched tree route calling repository methods that don't exist, a half-landed SOCK-1 in
  `SocketSync.tsx` calling `collectionStore` reducers that were never added, stale NTLM UI in `AuthEditor.tsx`
  after `RequestAuth` dropped the type, a missing body-building block in `UrlBar.tsx`'s `handleSend`, and
  `verbatimModuleSyntax` type-only-import violations under `client/src/transport/`). Also documented (not
  fixed) a newly found regression: `feat10.e2e.test.ts` fails 3/3 because `routes/importExport.ts`'s export
  route is still a one-line dummy and no import route exists, despite `TODO.md`'s changelog calling FEAT-10
  shipped. · `server/src/index.ts`, `server/src/routes/admin.ts`, `server/src/routes/collections.ts`,
  `server/src/tests/db.repositories.test.ts`, `client/src/components/collection/CollectionRunnerModal.tsx`,
  `client/src/components/common/SocketSync.tsx`, `client/src/components/request/AuthEditor.tsx`,
  `client/src/components/request/ConnectionEditor.tsx`, `client/src/components/request/UrlBar.tsx`,
  `client/src/transport/*.ts`, `client/src/utils/dialog.tsx`, `client/src/utils/scripts.ts`, `README.md`,
  `TODO.md`
* 2026-09-26 · CLEAN-8 · Untracked and deleted the six scratch `server/patch_*.js` files (no remaining
  references anywhere in the repo); `collections.ts.bak` was already gone. Dropped the `.gitignore` anchor
  on `/patch_*.js` so the pattern matches at any depth, not just the repo root, and added a regression test.
  · `.gitignore`, `server/patch_admin.js` (deleted), `server/patch_folder.js` (deleted),
  `server/patch_history.js` (deleted), `server/patch_repo.js` (deleted), `server/patch_request.js` (deleted),
  `server/patch_routes_collections.js` (deleted), `server/src/tests/clean8.test.ts`, `README.md`
* 2026-09-26 · TEST-1 · CI already had a Playwright job and `docker-publish.yml` already gated on it via
  `workflow_call` (both contrary to the stale spec) — the real blockers were `CERT_ENCRYPTION_KEY` missing
  from the "Start server" step (server never booted, so nothing after it ever ran) and admin.spec.ts
  permanently changing the seeded admin's password mid-run, breaking three other specs that hardcode
  `admin`/`admin`. Fixing the second surfaced a real production bug: `changePasswordSchema` required
  `currentPassword` unconditionally, so the forced first-login change 400'd for everyone, including the
  real `ForcePasswordChangeModal.tsx`. Fixed all three; `globalSetup` now walks the seeded admin through the
  forced change once via API before any spec runs. Also fixed a corrupted (mixed UTF-16/UTF-8)
  `server/.env.example`. A full local `--project=sqlite` run is 6 passed / 23 failed / 6 didn't run of 35 —
  the 23 are separate, pre-existing bugs, now tracked under TEST-3 and as FIX-6. · `.github/workflows/test.yml`,
  `server/.env.example`, `server/src/schemas/auth.schemas.ts`,
  `server/src/tests/changePasswordSchema.test.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/admin.spec.ts`,
  `tests/e2e/collection.spec.ts`, `tests/e2e/environments.spec.ts`, `tests/e2e/requests.spec.ts`, `README.md`,
  `TODO.md`
* 2026-09-26 · SEC-10 · Found already shipped (its own spec section was stale, describing
  `contentSecurityPolicy: false` and login-only rate limiting — neither true). Verified live with a headless
  browser, both with the real CSP and with it force-disabled to isolate cause: CSP+HSTS are on
  (`server/src/index.ts:140-161`), rate limiting covers login/register/OAuth/the public share route/every
  mutation app-wide (with a passing `sec10.e2e.test.ts`), and all three feared breakages (script runner,
  Monaco, the Handlebars visualizer) are already non-issues. No production code changed — added a headers
  regression test since none existed. Two new bugs found and filed separately, not fixed here: FIX-7
  (Monaco's worker fails to load, confirmed independent of CSP) and TEST-7 (`sec10.e2e.test.ts`'s flood
  pollutes the shared rate limiter for whatever suite runs next). · `server/src/tests/sec10-headers.test.ts`,
  `README.md`, `TODO.md`
