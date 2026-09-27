# Task 3 (priority order) — PERF-2: lazy-load the tree

Source: [`PLANTODO.md`](../PLANTODO.md) item #3 in [`ORDER_TASK.md`](../ORDER_TASK.md).

* **Size:** L.
* **Correction (2026-09-27):** its prerequisite (PERF-1 part 1, the batched `/tree` endpoint) is now shipped
  and in active use — `client/src/store/collectionStore.ts:176` calls
  `api.get('/workspaces/${workspaceId}/tree')`. But that is *all* that shipped: the client still loads the
  **entire** tree in that one call. There is no `foldersByCollection` / `requestsByFolder` map, no
  `'loading'`-per-node state, and no expand-to-fetch.

## Goal

Opening a workspace fetches collections only; children load on expand — **and once a node has loaded, it
never gets re-fetched.** (User direction, 2026-09-27: pure lazy-load-on-every-click would feel slow —
render from the in-memory store on subsequent expands of the same node, only hit the network the first time
a node is expanded.)

## Approach

* Move from the current flat `folders: Folder[]` / `requests: ApiRequest[]` arrays to per-node maps:
  `foldersByCollection` / `requestsByFolder`, whose values are `Folder[] | 'loading' | undefined`.
* `loadWorkspace` — collections only (already effectively what `/tree` gives minus the eager children; may
  need a leaner endpoint variant, or just ignore the folders/requests part of today's `/tree` response and
  fetch collections alone).
* `loadCollectionChildren(collectionId)` — called once per collection, guarded on the `'loading'` state so a
  double-click can't fire two requests; on completion, writes into `foldersByCollection`/`requestsByFolder`
  and the entry is never re-fetched afterward — re-expanding reads straight from the map.
* `loadFolderChildren(folderId)` — same pattern, one level down.
* Show a skeleton row while the map holds `'loading'`.
* Keep the Dexie offline cache but make it per-node and treat it as a **hint**: paint from cache instantly,
  then reconcile with the server response when it arrives (don't block the first paint on the network).
* Delete `fetchCollectionsData` once nothing references it.

## Traps

SOCK-1's reducers (`applyFolderUpserted`, `applyRequestUpserted`, etc. in `SocketSync.tsx`) write into these
same structures. Since SOCK-1 already shipped against the *old* flat-array shape, changing the shape here
means updating every one of those reducers in the same pass — design the new map shape with SOCK-1's write
patterns in mind, or the socket sync will silently break.

## Done when

With a 500-collection dataset: opening a workspace transfers under 100 KB and issues one request for the
collection list; expanding one collection issues exactly one more request; expanding it a second time (after
collapsing) issues **zero** further requests.
