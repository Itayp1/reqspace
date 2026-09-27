# PLANTODO — Reqspace

Large / multi-step items pulled out of [`TODO.md`](TODO.md) on 2026-09-27. Everything here is either **XL/L/M
in size**, an explicitly deferred architectural decision, or a greenfield programme — none of it was
implemented in the 2026-09-27 pass. Nothing here should be started piecemeal; read the whole entry, including
any **Correction** note, before touching code — several of these were far more (or less) done than `TODO.md`
claimed, and the correction says exactly what changed.

`TODO.md` still owns the project-wide Rules, "Before you touch anything", Scale targets, Vocabulary and
"Where the tests actually live" sections — read those first, they apply here too.

---

## SEC-0 — Delete the server-side proxy entirely

* **Size:** XL.
* **Original status (2026-09-25):** "deferred by the owner... do not start any SEC-0 subtask without saying
  so explicitly."

**Correction (2026-09-27): this is no longer an accurate description of the code.** Since the 09-25 pass,
substantial SEC-0 work has actually landed, undeferred, without the plan being updated:

* `client/src/transport/` **exists** — `types.ts`, `index.ts`, `browser.ts`, `electron.ts`, `extension.ts` —
  implementing exactly the abstraction SEC-0.2 asked for (`getTransport()` picks Electron → extension →
  fetch, in that order; `sendRequest()` is the single entry point).
* `extension/` **exists** at the repo root — `manifest.json`, `background.js`, `content.js`, `popup.html/js`,
  `options.html/js`. SEC-0.7 ("greenfield, nothing exists") is false; the Chrome extension transport is
  built. (Not independently re-audited for the 0.7.3/0.7.4/0.7.5 hardening details — origin allowlist,
  cookie policy, header restoration — verify those specifically before assuming 0.7 is complete, only that
  it exists and is wired up.)
* Of the five call sites SEC-0.2 listed, **four are migrated**: `CollectionRunnerModal.tsx:102`,
  `client/src/utils/scripts.ts:100`, `LoadTestModal.tsx:58`, `SharedCollectionPage.tsx:25` all call
  `sendRequest()` from `client/src/transport`.

**What's actually still open:**

1. **`client/src/components/request/UrlBar.tsx:231`** still calls `api.post('/proxy', ...)` directly — the
   one caller SEC-0.2 didn't migrate. This is the main "Send" button path, so it's the highest-traffic
   holdout.
2. **SEC-0.3 (client-driven history write) is not done.** `server/src/routes/proxy.ts` still writes history
   server-side via `saveHistoryEntry` (imported from `routes/history.ts`) whenever a proxied request
   completes. There is no client-driven `POST` history-write endpoint independent of the proxy route.
3. **SEC-0.4 (delete the old routes) is not done.** `server/src/routes/proxy.ts` and
   `server/src/routes/shareProxy.ts` both still exist and are mounted in `server/src/index.ts`
   (`shareProxyRouter` at line 28/228). `undici` is still a live dependency — correctly so, per the original
   note, until this step actually happens.

**Revised remaining scope:** migrate `UrlBar.tsx`, build the client-driven history-write endpoint (SEC-0.3),
then delete `proxy.ts` + `shareProxy.ts` and drop `undici` (SEC-0.4). This is meaningfully smaller than the
original XL estimate now that 0.2 and 0.7 are mostly done, but still multi-file, touches the app's most-used
code path, and needs the same care the original entry called for (traps: response-size cap from FEAT-9
applies to the new history endpoint; router-mount-order rules still apply if `shareProxy.ts` deletion changes
mount order).

* **Done when:** `grep -rn "api.post('/proxy'\|api/proxy\|shareProxy" client/src server/src` returns nothing,
  and `undici` is out of `server/package.json`.

---

## SEC-10 remainder — broaden rate limiting

* **Size:** S-M, but needs a judgment call, not a mechanical fix.

**Correction (2026-09-27):** the CSP/HSTS half of this task **is done** — `server/src/index.ts` now has a
real `helmet({ contentSecurityPolicy: {...}, hsts: ... })` config (`scriptSrc: ["'self'", "'unsafe-eval'"]`
for the sandbox worker, `workerSrc`/`childSrc: ["'self'", "blob:"]`, `hsts` gated on `NODE_ENV=production`).
The three original "blockers" (Monaco CDN load, unhosted Handlebars, SEC-3 dependency) are all cleared —
Monaco is now a real `client/package.json` dependency (bundled, not CDN-fetched) and the visualizer no longer
uses a CDN-loaded Handlebars at all.

**What's still open:** `rateLimit()` (`server/src/middleware/rateLimit.ts`, now Redis-aware — the
multi-replica problem PERF-5 flagged is already solved there) is applied to exactly the same three
`routes/auth.ts` endpoints plus `routes/share.ts`'s public GET. Nothing else in the API is throttled.

**Why this wasn't just implemented:** picking a global threshold blind is risky — the collection runner
(`CollectionRunnerModal.tsx`) and the lazy-tree/bulk-fetch endpoints can legitimately fire many requests in a
burst from one user, and there's no load-test data in this repo to pick a safe number from. Needs a human
call on which routes (or a global floor) and what ceiling, not a guess.

* **Done when:** whatever routes are chosen have `rateLimit(...)` applied and a test proves the ceiling
  trips.

---

## PERF-2 — Lazy-load the tree

* **Size:** L. **Correction (2026-09-27):** its prerequisite (PERF-1 part 1, the batched `/tree` endpoint) is
  now shipped and in active use — `client/src/store/collectionStore.ts:176` calls
  `api.get('/workspaces/${workspaceId}/tree')`. But that is *all* that shipped: the client still loads the
  entire tree in that one call. There is no `foldersByCollection` / `requestsByFolder` map, no
  `'loading'`-per-node state, and no expand-to-fetch. Original goal and change plan are otherwise unchanged
  from the 09-25 text — see git history of this file for the original snippet if needed, or re-derive from
  `collectionStore.ts`'s current flat-array shape.
* **Goal:** opening a workspace fetches collections only; children load on expand.
* **Done when:** with a 500-collection dataset, opening a workspace transfers under 100 KB and expanding one
  collection issues exactly one more request.

---

## PERF-3 — Paginate everything that returns a list

* **Size:** L. **Correction (2026-09-27): partially shipped**, narrower scope remains.
  * ✅ `server/src/routes/admin.ts` — real cursor pagination now (`{cursor, limit}` → `{items, nextCursor}`,
    capped at 200), for both the user list and the workspace list.
  * ❌ `server/src/routes/collections.ts` — the folders (`GET /collections/:collectionId/folders`) and
    requests (`GET /collections/:collectionId/requests`) list routes still take **no** pagination parameters
    at all.
  * ❌ `server/src/routes/history.ts` — `GET /workspaces/:workspaceId/history` is still offset-based
    (`offset: (+page-1)*+limit`) with **no server-side cap** on `limit`, plus a `SqlHistory.count()` on every
    page.
* **Change (narrowed):** apply the same cursor pattern already proven in `admin.ts` to the two collections.ts
  list routes and to history.ts. The original cursor-shape guidance (base64url cursor of `(order, id)` for
  tree nodes, `(createdAt, id)` for history, `limit + 1` fetch trick, 200-item server-side cap) still applies
  unchanged.
* **Traps (unchanged):** `idx_history_user_workspace` is still `(userId, workspaceId)` only — the
  `(userId, workspaceId, createdAt)` index history pagination needs does not exist yet; add it as a new
  migration, never by editing an existing one.
* **Done when:** all three remaining endpoints return `{items, nextCursor}`, cap at 200 server-side
  regardless of what the client requests, and `measure.ts` shows constant-time answers at 100k rows.

---

## PERF-4 — Kill the N+1 queries (items 2, 3, 4, 6, 7 remain)

* **Size:** L. **Correction (2026-09-27):** of the original 7 sites, **items 1 (reorder) and 5 (admin list)
  are confirmed fixed** — reorder uses a single bulk write (comment at `collections.ts:224` cites PERF-4
  directly), and admin listing now uses the PERF-3 cursor pagination instead of a full-table load.
* **Confirmed still broken, verified 2026-09-27:**
  * **Item 3** — `server/src/routes/history.ts`'s `saveHistoryEntry` GC path (around line 166) still does a
    `while` loop: `findOne(order ASC)` + `.destroy()` one row at a time until under the byte budget. Still a
    query-per-row loop exactly as originally described.
  * **Item 4** — `DELETE /api/workspaces/:workspaceId/history` (`history.ts`, "Clear all" route) still does
    `findAll(...)` to load every matching row into memory, `.reduce()`s the byte sum in JS, *then* issues the
    delete. Still a full-table load for what should be a DB-side aggregate.
* **Not re-verified this pass** (re-check before relying on this list): item 2
  (`checkPermission`/`resolveWorkspaceId` double-read per mutating call), item 6 (`middleware/rbac.ts` loading
  the full workspace `members` array per permission check), item 7
  (`RequestRepository.searchInWorkspace`'s `collectionIds: string[]` `Op.in` — also check whether it's still
  dead code per the original note before fixing it).
* **Fix, unchanged from the original plan:** one ranged delete with a computed cutoff for item 3; a DB-side
  `SUM()` aggregate for item 4's byte total.
* **Done when:** `measure.ts` shows a workspace history clear and the GC path each issuing O(1) queries
  regardless of row count.

---

## PERF-5 — Cache RBAC and system config (HTTP path still uncached)

* **Size:** M. **Correction (2026-09-27):** the `TtlCache` infrastructure this task asked for **exists**
  (`server/src/utils/cache.ts`, exporting `roleCache`) and **is wired in** — but only into the **socket join**
  path (`server/src/index.ts:112-118`, feeding SOCK-4's connection hygiene). It is **not** used anywhere in
  the HTTP request path: `server/src/middleware/rbac.ts`'s `getUserWorkspaceRole` still calls
  `WorkspaceRepository.findById` on every check, and nothing in `server/src/middleware/auth.ts` caches
  `SystemConfigRepository.getConfig()`, which still runs on every authenticated HTTP request.
* **Revised scope:** wire the existing `roleCache` (or a twin with the same TTL) into `rbac.ts`'s
  `getUserWorkspaceRole` and into `auth.ts`'s system-config read, with the same admin-save invalidation
  requirement as originally specified.
* **Done when:** `measure.ts` shows one `SystemConfig` DB read per 30s of sustained HTTP load instead of one
  per request, and an admin config save takes effect immediately.

---

## PERF-6 remainder — gzip

* **Size:** S, but grouped here because it's the tail of a larger verified item.
* **Correction (2026-09-27):** the `summaryOnly` projection this task asked for **is shipped** —
  `RequestRepository.findByCollections(ids, { summaryOnly: true })` exists and is used by the `/tree`
  endpoint. What's still missing: `compression` is not in `server/package.json` and not applied in
  `server/src/index.ts` — API responses are still sent uncompressed.
* **Done when:** `compression` is added and a test asserts a `Content-Encoding: gzip` response for a
  sufficiently large payload.

---

## PERF-7 — Client bundle weight

* **Size:** M. **Correction (2026-09-27):** the Monaco sequencing concern is resolved — `monaco-editor` is
  now a real `client/package.json` dependency (locally bundled), so PERF-7 no longer needs to wait on SEC-10
  (which is itself now mostly done, see above). Everything else in the original verified state is
  **unchanged**: `client/package.json` still ships **both** `moment` and `date-fns`, `lodash` is still
  whole-imported, `chai` and `crypto-js` are still runtime (not dev) dependencies, and the `@types/*` packages
  are still misplaced in `dependencies`.
* **Change (unchanged):** drop `moment` in favour of `date-fns` (or the reverse), import `lodash` per
  function or replace the few uses, move `@types/*` to `devDependencies`, lazy-load editors and the runner
  modal, set a CI bundle-size budget — now measured **with Monaco already in the bundle**, so the number
  captured today is the real baseline, not one that will jump the day CSP lands (it already has).
* **Done when:** the initial chunk is under an agreed budget and CI fails on a regression.

---

## TEST-3 — Journey coverage, per feature area

* **Size:** XL. **Correction (2026-09-27):** two of the original "biggest gap" rows are closed:
  * Row 10 (Import/Export) — `tests/e2e/import-export.spec.ts` now does a real export-then-import round trip,
    not just a button-existence check.
  * Row 11 (Share) — `tests/e2e/share.spec.ts` now generates a link, opens it **anonymously**, asserts secrets
    are stripped, and asserts revocation — the exact gap the original entry called out by name.
* Everything else in the original per-area gap table is **not re-verified in this pass** — assume the rest of
  the table (auth SSO/expired-session, workspace member-removal access loss, collection duplicate/move/reorder
  survival, request editing matrix, sending edge cases, environment secret masking, script failure paths,
  history search/quota, runner iteration/data-file/stop-mid-run, admin beyond login, tabs beyond
  drag-reorder, and the SOCK-2 event-family count) is still accurate until someone re-checks it.
* **Done when:** every area has real assertions and the suite passes on all three backends.

---

## TEST-6 — Scale and performance budgets

* **Size:** M. **Status unchanged from 2026-09-25** — `tests/e2e/api-perf.spec.ts` is still exactly the
  single `PERF_TIMEOUT`-based assertion against a freshly registered, zero-workspace user. No query-count
  budgets exist, and the PERF-0 dataset is not used by any perf test.
* **Change (unchanged):** budgets that run against the PERF-0 dataset, asserting query counts (stable across
  machines) as well as milliseconds.
* **Done when:** the budgets run in CI and reintroducing a deliberate N+1 turns them red.

---

## UI-4 — Accessibility

* **Size:** L. **Correction (2026-09-27): the most urgent blocker is fixed.** A global `*:focus-visible` rule
  now exists in `client/src/index.css` (plus a `.skip-to-main:focus-visible` rule) — the app is no longer
  fully unnavigable by keyboard, which was the single worst finding in the original entry.
* **Still open:** `@axe-core/playwright` is still not in `client/package.json` (no automated a11y scan
  exists). `aria-label`/`aria-modal`/`role=` attributes now appear in only **8** files — up from zero, but
  still sparse across a much larger component tree. `outline-none`/`focus:outline-none` occurrences are now
  **76** (up from 73 at the 09-25 count) — the global fix means a stripped outline usually still shows a
  ring via `:focus-visible`, but every one of those 76 sites should be spot-checked, not assumed fine by
  default.
* **Done when:** an axe scan of the main screen, one modal and the admin page reports no critical
  violations, and every interactive control shows a focus ring when tabbed to.

---

## FEAT-5 — Collaboration programme

Original framing: "All five have no prior art... 5.4 must precede 5.5, which must precede 5.6."

**Correction (2026-09-27): this framing is now wrong for 5.3.** `server/src/routes/forks.ts` exists and
implements `POST /collections/:id/fork` and `POST /collections/:id/sync-upstream`, backed by migration
`server/src/db/migrations/010-fork-tables.ts` (`collection_forks`, `fork_item_hashes` tables). **FEAT-5.3 is
shipped**, not greenfield. This was not re-audited against the original 5.3 "Done when" criteria
(parity-item-29 acceptance details) — only confirmed the routes and schema exist and look functionally
complete (fork + one-way sync-from-upstream). Verify its actual test coverage before assuming it's fully
done.

### FEAT-5.1 — Collection-level RBAC *(parity item 28)*

* **Size:** L. **Status unchanged:** `grep`-ing for any collection-scoped ACL storage (`collectionAcl`,
  `CollectionMember`, or similar) across `server/src` returns nothing. `server/src/middleware/rbac.ts` is
  still workspace-granularity only. Still greenfield, still the natural prerequisite for narrowing access
  per-collection.
* **Goal:** a member's workspace role can be narrowed (never widened) on a specific collection.
* **Done when:** API tests prove a workspace `editor` narrowed to `viewer` on one collection gets 403 on that
  collection and 200 on another.

### FEAT-5.2 — `@` mentions in comments *(parity item 33)*

* **Size:** M. **Status unchanged:** `client/src/components/common/CommentsEditor.tsx` still has zero mention
  handling; `UserAutocomplete.tsx` is still only wired into `WorkspaceSettingsModal.tsx`.
* **Done when:** a test mentions a member, asserts that member sees a notification, and asserts a non-member
  cannot be mentioned.

### FEAT-5.4 — Collection versioning *(prerequisite for merge)* — ambiguous, needs a call

* **Size:** L. **Correction (2026-09-27):** given FEAT-5.3 (fork) shipped with a `sync-upstream` route, there
  is now a *de facto* one-way pull-and-diff mechanism (`fork_item_hashes` suggests content hashing for
  diffing). It is not clear whether this satisfies what "collection versioning" was meant to provide (an
  explicit version history a user can browse/restore), or whether real version rows are still wanted on top.
  **Ask before scoping this** — it may already be substantially covered by what 5.3 built, or it may need an
  entirely separate version-history model. Don't assume either answer.

### FEAT-5.5 — Pull requests *(parity item 30)*

* **Size:** XL. **Status unchanged:** no PR-shaped routes or model found anywhere in `server/src`. Still
  greenfield. Its original prerequisite (5.3) is now met; re-confirm the 5.4 question above before starting,
  since a PR flow likely wants to diff against whatever "version" ends up meaning.

### FEAT-5.6 — Merge and conflict resolution *(parity item 31)*

* **Size:** XL. **Status unchanged:** no merge/conflict-resolution code found. Still greenfield, still
  depends on 5.5.

### FEAT-5.7 — Partner workspaces *(parity item 27)*

* **Size:** L. **Status unchanged:** `grep -rln "partner" server/src client/src` returns nothing. Still fully
  greenfield, no dependency on the others.

---

# Removed / superseded while building this file

Nothing was deleted outright from this file since it is new — but note that `TODO.md`'s own historical
"Removed on 2026-09-25" table remains the authoritative record for anything shipped before this pass. See
`TODO.md`'s "Removed on 2026-09-27" section for everything found already-shipped during *this* pass (2026-09-27),
including several items that used to live in this size class before being reclassified as done.
