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
