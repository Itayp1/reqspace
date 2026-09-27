# Task 2 (priority order) — PERF-4: kill the remaining N+1 queries

Source: [`PLANTODO.md`](../PLANTODO.md) item #5 in [`ORDER_TASK.md`](../ORDER_TASK.md).

* **Size:** L. Fix with a batched query or DB-side aggregate, never a loop.
* **Correction (2026-09-27):** of the original 7 sites, **items 1 (reorder) and 5 (admin list) are confirmed
  fixed** — reorder uses a single bulk write (comment at `collections.ts:224` cites PERF-4 directly), and
  admin listing now uses cursor pagination instead of a full-table load.

## Confirmed still broken (verified 2026-09-27)

* **Item 3** — `server/src/routes/history.ts`'s `saveHistoryEntry` GC path (around line 166) still does a
  `while` loop: `findOne(order ASC)` + `.destroy()` one row at a time until under the byte budget. Still a
  query-per-row loop exactly as originally described.
* **Item 4** — `DELETE /api/workspaces/:workspaceId/history` (`history.ts`, "Clear all" route) still does
  `findAll(...)` to load every matching row into memory, `.reduce()`s the byte sum in JS, *then* issues the
  delete. Still a full-table load for what should be a DB-side aggregate.

## Not re-verified this pass — re-check before relying on this list

* **Item 2** — `checkPermission`/`resolveWorkspaceId` double-read per mutating call.
* **Item 6** — `middleware/rbac.ts` loading the full workspace `members` array per permission check.
* **Item 7** — `RequestRepository.searchInWorkspace`'s `collectionIds: string[]` `Op.in`. Also check whether
  it's still dead code per the original note before fixing it — no point optimizing an unused method.

## Fix (unchanged from the original plan)

* One ranged `DELETE ... WHERE` with a computed cutoff for item 3, instead of the row-at-a-time loop.
* A DB-side `SUM()` aggregate for item 4's byte total, instead of loading every row into JS to reduce.
* For items 2/6/7 (once re-verified): denormalize `workspaceId` onto folders/requests, or cache the role
  decision (this overlaps with task 04's PERF-5 cache work — check if that lands first).

## Done when

`measure.ts` shows a workspace history clear and the GC path each issuing O(1) queries regardless of row
count.
