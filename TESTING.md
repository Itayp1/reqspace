# reqSpace - Testing Guide

This project contains a comprehensive automated test suite utilizing [Playwright](https://playwright.dev/). The suite is designed to cover the entire feature set, including role-based access control (RBAC), UI stability, authentication mechanisms, and core workflows.

## Prerequisites
Ensure the server and client are built and running. The tests run against the local instance by default (e.g., `http://localhost:3005`).
```bash
# Build the client & server
npm run build --prefix client
npm run build --prefix server

# Start the application
pm2 restart reqspace
# OR node server/dist/index.js
```

## Running the Tests

To execute the entire test suite (including the comprehensive matrix of ~300 test scenarios):
```bash
npx playwright test
```

### Specific Suites
You can run specific test files if you are only working on a particular component:

- **Comprehensive Permissions & Features (300+ scenarios):**
  ```bash
  npx playwright test tests/comprehensive-permissions.spec.ts
  ```
- **Core E2E User Journey:**
  ```bash
  npx playwright test tests/reqspace.spec.ts
  ```
- **Specific Feature Segments:**
  ```bash
  npx playwright test tests/features-part1.spec.ts
  # Part 2, Part 3, etc.
  ```

## Test Structure & Maintenance Reference

If the code changes in the future, you may need to update the corresponding tests:

1. **`comprehensive-permissions.spec.ts`**
   - **What it covers:** The full Role matrix (`viewer`, `runner`, `tester`, `editor`, `admin`, `owner`) cross-multiplied by all Actions (`create_collection`, `edit_request`, `run_request`, `delete_workspace`, etc.). Also covers UI zoom/resize stability tests and the `UID` Header Auth flow.
   - **When to update:** If you add a new role, modify minimum permission levels for actions, or change the authentication `uid` header logic.
2. **`reqspace.spec.ts`**
   - **What it covers:** The main E2E flow (Register -> Create Workspace -> Create Collection -> Add Request -> Send Request -> View Response).
   - **When to update:** If the main user journey changes, or if critical DOM elements (like the New Request button) are renamed or restructured.
3. **`features-part[1-5].spec.ts`**
   - **What they cover:** UI specific interactions, form validations, Collection Explorer rendering, and Environment tabs.
   - **When to update:** If you change how tabs open/close, modify the layout, or alter how variables are injected.

## Debugging Tests
If a test fails, you can run it with the UI mode to visually inspect the failure:
```bash
npx playwright test --ui
```

---

# Test Coverage Gaps — and how to close them

> Written 2026-09-24 after a review found bugs that this suite reported green on.
> Read this before adding tests, so the next round doesn't repeat the same shape.

## What went wrong

Three defects survived a ~300-scenario suite. None of them was subtle; all three sat in a blind spot the suite's *structure* created.

**1. Realtime `update` / `delete` broadcasts are dead, and both socket suites tested `create`.**

`server/src/routes/collections.ts` splits into two families:

| Family | Lines | workspaceId comes from | Status |
|---|---|---|---|
| `collection/folder/request:created` | 57, 103, 160 | the URL path (`/workspaces/:workspaceId/...`) or a DB lookup | ✅ works |
| `collection/folder/request:updated`, `:deleted` | 64, 73, 111, 119, 177, 183 | `(req as any).resolvedWorkspaceId` | ❌ **always `undefined`** |

`resolvedWorkspaceId` is never assigned anywhere in the codebase, and `emitToWorkspace` opens with `if (!workspaceId) return;`. All six are silent no-ops.

Both `tests/socket-sync.spec.ts:62` and `tests/socket-security.spec.ts:119` listen for `collection:created` — and nothing anywhere in `tests/` or `client/e2e/` references `:updated` or `:deleted`. The two suites were written independently and converged on the same event, because `create` is the one route family where the workspace id is handed to you in the URL and no resolution step exists to break.

**Rule this gives us:** coverage of one event in a family proves nothing about the others when they obtain their routing key differently. Enumerate the emit sites, not the feature.

**2. The multi-DB loop only exercises public routes.**

`test-all-dbs.ps1:65` runs exactly one file per backend — `src/tests/auth.e2e.test.ts`, which is register + login + wrong-password. All three are **unauthenticated** routes that go through `UserRepository` (dialect-aware, SQL-safe). The SQL defect lives in `middleware/auth.ts:109` (`User.findById`, raw Mongoose), which only executes on *authenticated* requests. The loop never sends one, prints `🎉 ALL DATABASES TESTED SUCCESSFULLY!`, and the app is unusable one request after login.

**Rule:** a backend-compatibility test that never crosses the auth boundary tests almost nothing.

**3. Nothing runs automatically.** The only workflow is `.github/workflows/docker-publish.yml`. Images ship without a single test having run.

## How to write the missing tests

### Prove the test fails first

Every test below targets a defect that is live in `master` right now. Write the test, run it against unpatched code, and **watch it fail**. A realtime test that passes before the fix is asserting on the wrong thing — which is precisely how the existing socket tests came to be.

### Socket events: enumerate emit sites, then cover the matrix

Derive the list from the source, not from the feature description:

```bash
grep -n "emitToWorkspace" server/src/routes/*.ts
```

Every call site needs a two-client test. Current inventory:

| Event | Route | Covered today |
|---|---|---|
| `collection:created` | `POST /workspaces/:workspaceId/collections` | ✅ (twice over) |
| `collection:updated` | `PUT /collections/:id` | ❌ |
| `collection:deleted` | `DELETE /collections/:id` | ❌ |
| `folder:created` | `POST /collections/:collectionId/folders` | ❌ |
| `folder:updated` | `PUT /folders/:id` | ❌ |
| `folder:deleted` | `DELETE /folders/:id` | ❌ |
| `request:created` | `POST /folders/:folderId/requests` | ❌ |
| `request:updated` | `PUT /requests/:id` | ❌ |
| `request:deleted` | `DELETE /requests/:id` | ❌ |
| `workspace:reordered` | `PUT /workspaces/:workspaceId/reorder` | ❌ |

Use the API-level harness from `tests/socket-security.spec.ts` (`registerAndGetCookie`, `connectSocket`, `waitFor`) rather than driving the UI — it isolates the server's emit behaviour from client-side rendering, and runs in a fraction of the time. Shape:

```ts
// client B listens, client A mutates, B must receive it
socketB.on('request:updated', (r) => received.push(r));
await request.put(`${BASE}/api/requests/${requestId}`, {
  headers: { cookie: owner.cookie },
  data: { name: 'renamed' },
});
await expect.poll(() => received.length, { timeout: 3000 }).toBeGreaterThan(0);
```

Note this must be a **second connected client**, not a second tab of the same socket: `emitToWorkspace` suppresses broadcasts when the room holds one socket, so a single-client test passes vacuously whether or not the code works.

### Don't let the `size > 1` guard hide multi-node failures

`socketUtils.ts:13` counts sockets via `io.sockets.adapter.rooms`, which under a Redis adapter sees **only the local node**. A test on a single instance can never observe this. When Redis mode lands, add a test that boots two server processes against one Redis instance, connects a client to each, and asserts an event raised on node A arrives at the client on node B. Until then, the single-node tests above are necessary but explicitly insufficient — say so in a comment on the spec.

### Make the multi-DB loop cross the auth boundary

`auth.e2e.test.ts` is not a backend-compatibility test. Per DB, the loop should at minimum:

1. register → login (already covered)
2. **`GET /api/auth/me`** with the session cookie — the first authenticated call, and the one that fails today under `DB_TYPE=sqlite`
3. create a workspace → create a collection → create a request → read the tree back
4. update and delete one of each
5. assert every id round-trips (Mongo `ObjectId` vs SQL `UUID` — the `mongoose.isValidObjectId` gate in `middleware/rbac.ts` and `Types.ObjectId(workspaceId)` in the proxy path both reject UUIDs)

Better still: run the whole Playwright suite per backend by parameterising `DB_TYPE`, and keep the Jest file only as a fast smoke check. The suite currently runs against whatever is in `server/.env` — one backend, silently.

### Add the CI workflow

Tests that only run when a human remembers to type the command are not a safety net. A `test.yml` should, on push and PR: build client + server, start the server under `DB_TYPE=sqlite`, run the Jest smoke test, run Playwright, and upload the HTML report as an artifact. Gate `docker-publish.yml` on it so an image cannot ship from a red build.

Two config notes when wiring this up:
- `playwright.config.ts:85-89` has `webServer` commented out, so the suite assumes a server is already up. CI must either start one explicitly or that block must be re-enabled.
- `retries: 2` on CI will mask a genuinely flaky test as a pass. Keep the retry, but treat any test that needs it as a bug to file, not noise to absorb.

### Stop writing placeholder tests

`tests/socket-sync.spec.ts:3-29` documents 18 tests that asserted `expect(true).toBe(true)` — they reported green for real-time collaboration features nobody had verified. Items 1 and 4 on that leftover "untested" list describe **exactly** the broken update/delete paths.

A placeholder that passes is worse than a missing test: it converts an unknown into a false assurance, and it consumes the slot where the real test would have gone. If a scenario is not yet implemented, use `test.skip` or `test.fixme` so the runner reports it as outstanding.

### Also uncovered

These have no test at all today, and each maps to a live finding in `CODE_REVIEW.md`:

- **Logout** — `auth.e2e.test.ts:51` asserts the cookie is *set* on login; nothing asserts it is *cleared* on logout. `clearCookie` currently omits the flags used to set it (`CR#16`), so the session may survive.
- **SSO account creation** — `models/User.ts:64` allows `authType` of `password | header` only, while `routes/auth.ts:210` writes `'sso'`. Needs a test double for the Google token endpoint; today nothing exercises this path (`CR#15`).
- **SSRF guards** — `server/src/utils/ssrf.ts` has no unit tests. Cover the parser cases directly (NAT64 `64:ff9b:`, `0x7f000001`, trailing-dot hosts, IPv4-mapped forms) plus an integration test that a redirect to a private address is refused.
- **Authorization holes** — `access-control.spec.ts` and `comprehensive-permissions.spec.ts` verify the UI hides what a role may not do. They do not call the API directly as a lower-privileged user. Every finding in `CR#7`, `CR#11`, `CR#12` and `CR#14` is reachable only by bypassing the UI, so each needs a test that sends the raw request with a viewer's cookie and asserts `403`.
