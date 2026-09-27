# PLANSYNC — Smart Fork remaining work

Lower-priority follow-ups to the fork/auto-sync feature (`server/src/routes/forks.ts`,
`server/src/routes/collections.ts`, `client/src/components/collection/ForkModal.tsx`). The critical and
high-severity findings from the code review (broken wiring, IDOR, dead hash comparison, sync races, lost
hierarchy, non-cascading deletes, missing indexes, dead `copyVars` checkbox) are **already fixed** and covered
by `server/src/tests/fork.test.ts` (9 tests, all green) — see git history for that pass. Everything below is
what was explicitly deferred at the end of that review, in priority order.

Read `server/src/routes/forks.ts` top-to-bottom before touching anything here — several items below
interact with each other (in particular #1 and #2 both touch the hashing functions).

---

## 1. Hash-field inconsistency (what's hashed vs. what's synced)

* **Size:** S–M.
* **Status:** done. `description` is now hashed (folder + collection) and synced
  alongside the other content fields — not left un-hashed as originally
  suggested, since that turned out to silently drop a description-only
  upstream change (nothing else changes the hash, so the sync gate never
  trips; caught by a test). `order` stays excluded from both, now with an
  explicit comment on each `hash*` function. Covered by a new test in
  `fork.test.ts`.

**The problem:** the three `hash*` functions in `forks.ts` don't cover the same fields as what the sync
logic actually writes back, and they're inconsistent with each other about which metadata counts as
"ownership":

| field | hashed? | synced when unmodified? |
|---|---|---|
| `folder.name` | ✅ | ✅ |
| `folder.description` | ❌ | ❌ (never synced, even though it's not hashed either) |
| `folder.order` | ❌ | ❌ |
| `collection.name` | ❌ (excluded on purpose, see comment in `hashCollection`) | ❌ (never synced) |
| `collection.description` | ❌ | ❌ |
| `request.name` | ❌ (excluded on purpose) | ❌ (never synced) |

The `name` exclusions for folder/request/collection are intentional (a rename shouldn't count as "the fork
owner touched this item"), and that reasoning is sound and already documented inline — don't change those.
The actual bug is `description` (folder and collection) and `order`: they're in neither the hash nor the
sync payload, so editing a folder's description upstream silently does nothing, forever, with no signal to
the user that it was dropped.

**Fix:**
1. Decide once, for real: is `description` "ownable content" (→ add to the hash, sync it like
   `preRequestScript`/`testScript`) or "cosmetic like name" (→ leave un-hashed, but then also add it to the
   sync payload alongside `name` so it isn't silently dropped)? Recommend the latter — `description` reads
   like documentation a fork owner would want to keep in their own words, same bucket as `name`.
2. Whichever way it goes, update the three `hash*` functions and the three `*Repository.update(...)` calls
   in `doSyncForksOfCollection` together, in the same commit — that's the actual bug here, the two lists
   drifting apart.
3. `order` should almost certainly stay out of both: it's workspace-local UI arrangement, not content. Add a
   one-line comment next to each `hash*` function saying so, so the next person doesn't "fix" it by adding
   `order` back in.

* **Done when:** every field written by a sync `*Repository.update(...)` call is also a field read by the
  corresponding `hash*` function, or is explicitly commented as intentionally excluded (matching the
  existing `name` comments' style).

---

## 2. Per-item DB writes instead of bulk (fork creation + sync)

* **Size:** M.
* **Status:** not started — deliberately skipped this pass per the plan's own
  guidance ("don't start it speculatively"). No indication yet of a
  real collection size forcing the issue.

**The problem:** both `POST /collections/:id/fork` and `doSyncForksOfCollection` loop over folders/requests
and call `FolderRepository.create`/`update` and `RequestRepository.create`/`update` one row at a time. For a
300-request collection that's 300+ sequential round-trips just for the initial fork, and the same again on
every sync that touches many rows. `fork_item_hashes` already gets this right (`bulkCreate` once at the end
of the fork route) — the rest of the file doesn't follow that pattern yet.

**Why this is lower priority than the stuff already fixed:** it's a latency/throughput problem, not a
correctness one — small-to-medium collections (the common case) won't notice. It matters once someone forks
a collection with hundreds of requests, or a source collection with many forks gets edited during peak
concurrent usage.

**Fix, in order of effort:**
1. **Fork creation** (`POST /collections/:id/fork`): collect all folder-create payloads, `SqlFolder.bulkCreate`
   once (after resolving `parentFolderId` via `folderIdMap` — note the topological-sort dependency means
   parent ids must be assigned *before* the bulk insert, so pre-generate every folder's `id` with `uuidv4()`
   client-side instead of letting the DB default it, then build `folderIdMap` from that up front). Same for
   requests. This turns the O(n) round-trip loop into O(1) (well, O(fork) — one call per collection, not per
   item).
2. **Sync updates**: harder, because each row currently gets a different patch depending on whether it
   changed — can't use a single `bulkCreate({updateOnDuplicate})` call the way `/reorder` does (`collections.ts`
   `PUT /reorder`) unless every row in a batch shares the exact same patch shape. Splitting into "same-patch"
   batches is possible but fiddly; a lower-effort first step is just wrapping each fork's create/update/delete
   calls in a single Sequelize transaction (`sequelize.transaction`) so at least it's one round-trip commit
   instead of N commits, without changing the per-row query count.
3. Benchmark before/after with a synthetic collection of ~500 requests across ~50 folders, forked, then
   synced after touching ~100 of those items upstream. Compare against the existing perf-budget tests
   (`server/src/tests/perf.budgets.test.ts`) for the query-count style this repo already uses (see
   `8fa8e1a TEST-6: add real scale/perf budgets in CI`) — add a fork-specific budget test in that same file
   rather than a new one.

* **Done when:** fork creation of a 500-item collection is O(few) queries, not O(items); a perf-budget test
  exists for it alongside the existing ones.

---

## 3. `copyEnvironmentId` has no UI — server-side support is currently dead code from the user's perspective

* **Size:** S.
* **Status:** done. `ForkModal.tsx` now fetches the active workspace's
  environments (reusing the existing `GET /workspaces/:workspaceId/environments`
  endpoint — no new server route needed) and renders a `<select>` alongside the
  existing "Copy Collection Variables" checkbox, wired to a real `copyEnvId`
  setter.
  While wiring this up, found the smart-fork dialog itself was unreachable
  from the UI — `CollectionExplorer.tsx` had a `fork-collection` event
  listener with nothing anywhere dispatching it. Added a "Fork (Auto-sync)"
  context-menu item to fix that (distinct from the pre-existing
  "Duplicate / Fork" and "Fork to Workspace" items, which are the plain,
  non-syncing copy).

**Current state:** `ForkModal.tsx` has `const [copyEnvId] = useState('')` — no setter, no dropdown, nothing
in the JSX renders it. The value is therefore always `''` → always sent as `undefined` → the server-side
IDOR-guarded copy path (fixed in the critical pass) is exercised by zero real user flows. This isn't a bug
exactly (nothing is broken), but it means half the feature described in the original design doc
(`for_sonnet_or_opus_review.md`, section "Frontend Integration") doesn't actually exist for users.

**Fix:**
1. Add a `GET` for "environments in the source collection's workspace" (check whether one already exists —
   likely under `server/src/routes/environments.ts` or similar; don't add a new endpoint if the data's
   already fetchable).
2. In `ForkModal.tsx`, once `collectionId` is known, fetch that list and render a `<select>` (same pattern as
   the existing "Target workspace" `<select>`), defaulting to "none". Wire its `onChange` to `setCopyEnvId`
   (needs a real setter — currently doesn't have one).
3. Keep the "Copy Collection Variables" checkbox and the new environment picker visually distinct — they're
   unrelated (collection variables vs. workspace environments) and a user could plausibly want either
   independently.

* **Done when:** a user can actually pick a source environment to copy in the fork dialog, and it shows up
  in the target workspace afterward.

---

## 4. Fork-of-fork doesn't cascade

* **Size:** S (design decision) + S (implementation) once decided.
* **Status:** done (decision made: one-hop only). Documented as the
  intentional design in the top comment of `forks.ts` — no code change to the
  sync logic.

**Current behavior:** forking a fork works fine (creates a new independent `collection_forks` row pointing at
the fork as its own "source"). But when the *original* source changes, sync only walks one hop
(`SqlCollectionFork.findAll({ where: { sourceCollectionId } })` — direct children only). A fork-of-a-fork
never sees upstream-of-upstream changes propagate through, even for items neither owner touched.

**Open question to resolve before coding:** should sync cascade transitively (A→B→C, edit A, unmodified items
in C eventually get it too), or is one hop the intended design (a fork is a deliberate, one-time-ish
detachment point, and re-forking is how you'd pull further changes in)? The original design doc doesn't say.
Given the "smart" pitch is specifically about *not* needing to manually re-pull, transitive cascade is
probably the right answer, but confirm with whoever owns the feature before implementing — this changes the
mental model users are sold on.

**If transitive cascade is chosen:** `doSyncForksOfCollection`'s notification step already knows the forked
collection's id; after successfully syncing fork B, call `syncForksOfCollection(forkedColId)` recursively (B
acting as source for C). Needs a visited-set guard against cycles (shouldn't be possible via the UI today,
but don't trust that) and should reuse the existing per-collection in-process lock rather than fighting it.

* **Done when:** either (a) documented as an intentional one-hop design in the route file's top comment, or
  (b) implemented with cascade + a cycle guard + a test with a 3-deep fork chain.

---

## 5. No way to detach/unfork, and no user-facing signal when a sync silently fails

* **Size:** M.
* **Status:** done.
  1. `DELETE /collections/:id/fork` added — fork owner or workspace editor+
     can detach, reusing the same hash-cleanup as `cleanupForkRecordsForCollection`.
     Not wired into the collection-delete path (unchanged, as specified).
  2. Migration 013 adds `collection_forks.lastSyncError`. `doSyncForksOfCollection`
     now catches per-fork (not once around the whole batch), so one broken
     fork doesn't stop its siblings from syncing; it sets/clears `lastSyncError`
     each run and `fork-status` now returns it. Client: `CollectionExplorer`
     fetches fork-status per collection node and shows a small amber warning
     icon (`AlertTriangle`, title = the error) when a sync is failing.
  Covered by two new tests in `fork.test.ts`.

Two related gaps, both about the fork owner having zero visibility/control once forked:

1. **No unfork.** Once forked, there's no route to stop tracking upstream (delete the `collection_forks` row
   without deleting the collection itself). A user who wants to "graduate" their fork into a fully
   independent collection has no way to do that short of an admin touching the DB.
2. **Silent failure.** `doSyncForksOfCollection`'s catch block only does `console.error('[fork sync] error:',
   err)`. If a sync throws (bad data, a deleted workspace, whatever), the fork just stops updating with no
   record anywhere and no user-visible signal — `lastSyncAt` simply stops advancing, which nothing surfaces
   today even via `GET /collections/:id/fork-status` (added in the critical pass — it returns `lastSyncAt`
   but there's no "and here's whether the last attempt actually succeeded" field).

**Fix:**
1. `DELETE /collections/:id/fork` (new route): removes the `collection_forks` row (and its
   `fork_item_hashes`) for that collection without touching the collection or its contents — reuses
   `cleanupForkRecordsForCollection` from `forks.ts`, just needs a permission check (fork owner or
   workspace editor+) and to *not* be called from the collection-delete path (that's a different, already-
   handled case).
2. Add a `lastSyncError: string | null` column to `collection_forks` (migration 013) and `SqlCollectionFork`
   set/cleared at the top/bottom of each `doSyncForksOfCollection` iteration's try block. Surface it in
   `fork-status`. Client-side: a small warning badge in `CollectionExplorer` or wherever the fork's status
   would naturally show — exact placement is a UI call, not specified here.

* **Done when:** a fork owner can detach without deleting their copy, and a broken sync is visible somewhere
  in the UI instead of only in server logs.

---

## 6. Browser-level (e2e) coverage

* **Size:** M.
* **Status:** done. Added `tests/e2e/fork.spec.ts` (Playwright, `sqlite` project):
  opens the fork modal, forks into another workspace, checks the toast,
  switches workspaces and confirms the collection appears, and — using a
  second tab in the same session that never reloads — confirms an unmodified
  folder rename in the source propagates live via the `collection:fork-synced`
  socket event.
  Writing this caught a real bug: `SocketSync.tsx`'s `collection:fork-synced`
  handler only refreshed the top-level collection list, never an
  already-open collection's cached folder/request children — so a synced
  change to something the user was actively looking at silently never
  rendered. Fixed via a new `refreshCollectionChildren` store action that
  evicts the cache and refetches, called from the socket handler.
  Also had to add `data-testid`s to `ForkModal.tsx` (it had none) and fix the
  test's own assumption that workspace creation uses a native `prompt()` — it
  actually uses this app's custom `PromptModal`.

This repo has an established e2e journey-test convention (`59eddc4 test: Implement Area 4 (Request editing)
journey tests`, `08ed4c2 test(e2e): cover environments precedence as per Area 6`, etc. — check whichever
`e2e/` directory those live in for the harness/pattern). A fork journey test should at minimum: open the fork
modal, fork into another workspace, switch workspaces, confirm the toast fired (added in the critical pass)
and the forked collection appears; separately, edit the source and confirm — via the socket event, not a
manual API poll — that an unmodified fork item updates live in the UI.

* **Done when:** a fork journey test exists following this repo's existing e2e Area-N convention.

---

## Suggested order

1 and 3 are cheap and self-contained — good first pickups. 2 is the most involved and only matters at scale;
don't start it speculatively, wait until a real collection size makes it necessary or do it opportunistically
alongside other perf work (there's precedent — `PERF-2` through `PERF-6` in git log). 4 needs a product answer
before any code. 5 and 6 round it out once the rest is settled.
