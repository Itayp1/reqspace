# End-to-end coverage audit

Written 2026-10-07. This is the record for **TEST-3 — Journey coverage, per feature area**.

Method: every `data-testid` in `client/src` was diffed against every id referenced from `tests/e2e`, and
every mounted component and server route was walked to find features with no browser test at all. The
"unreferenced id" list is the cheapest honest signal of an untested surface, so it is worth re-running
after any UI work:

```bash
# ids the client renders
grep -rhoE 'data-testid=(\{`[^`]*`\}|"[^"]*")' client/src \
  | sed -E 's/data-testid=//; s/^\{`//; s/`\}$//; s/^"//; s/"$//' | sort -u > /tmp/client-ids
# ids the e2e suite drives
grep -rhoE "getByTestId\(['\`\"][^'\`\"]*" tests/e2e \
  | sed -E "s/getByTestId\(['\`\"]//" | sort -u > /tmp/test-ids
comm -23 /tmp/client-ids /tmp/test-ids | grep -v '\${'
```

## Coverage per feature area

| Area | Specs | State |
|---|---|---|
| Authentication | `auth`, `auth-api`, `admin` | ✅ login, logout, register, forced first-login change, expired session, SSO option |
| Authorization / RBAC | `api-authorization`, `rbac`, `permission-toast`, `workspace` | ✅ role matrix per endpoint, mass-assignment, viewer-vs-editor in the UI, member removal revokes live |
| Workspaces | `workspace`, `crud-rename`, `group-scripts-activity` | ✅ create/edit/switch/delete, rename matrix, members, Activity / Changelog tab |
| Collections & folders | `collection`, `crud-rename` | ✅ create, nest, rename, delete, duplicate, move, reorder-survives-reload |
| Collection actions | `collection-actions` | ✅ View Documentation, Copy to Workspace (collection + single request), Export |
| Requests | `requests`, `edgecases` | ✅ all methods, params, headers, raw/form-data/urlencoded/JSON bodies, dirty state, undo/redo, JSON-comment stripping |
| Request auth | `requests`, `share` | ⚠️ bearer + basic only — **apikey, oauth2 and inherit are untested** |
| Saving | `requests`, `save-as` | ✅ plain Save, Save dropdown, Save As…, create collection/folder from inside the Save modal |
| Tabs | `tabs`, `concurrency` | ✅ drag-reorder (now waits on the drop indicator), content persistence, 10 tabs with a background send |
| Response viewer | `response` | ✅ per-mode viewer, image/PDF, timeout and error paths, test results, code generation |
| Scripts | `scripts`, `scripts-scope`, `group-scripts-activity` | ✅ pre-request at collection/folder/request, test scripts at all three levels, failing assertions, `pm.sendRequest`, sandbox isolation |
| Variables | `environments`, `variable-scopes` | ✅ environment, globals, secret masking, collection variables, workspace-local, profile, and the precedence between them |
| History | `history` | ✅ logged, replayable, searchable, save-to-collection, large-body truncation |
| Import / Export | `import-export`, `collection-actions` | ✅ admin dump round-trip, per-collection export |
| Share links | `share` | ⚠️ generate, strip secrets, revoke — **the public `SharedCollectionPage` UI and its "fork to my workspace" flow are untested** |
| Realtime | `socket-events`, `socket-sync`, `socket-advanced`, `sock1-no-refetch`, `conflict` | ✅ all 13 event families, cross-user sync, conflict prompt, zero-refetch guarantee |
| Smart fork | `fork` | ⚠️ fork + live sync + the personal-workspace guard — **ForkModal's copy-variables / copy-environment options are untested** |
| Collection runner | `runner` | ✅ configure + run, JSON and CSV data files drive iterations, stop mid-run |
| Load tester | `load-test` | ✅ exact iteration count, success/failure split, concurrency, stop |
| Connections | `connections` | ⚠️ WebSocket (connect/send/echo/server-close), SSE (push + send disabled + error), Kafka stub — **Socket.IO is only selected, never connected** |
| Cookies | `cookies-console` | ✅ add domain, edit, attach to a matching request, skip a non-matching one, persist across reload, delete |
| Console drawer | `cookies-console` | ✅ request entries with the headers actually sent, script `console.log` entries, expand, clear, close |
| Global search | `global-search` | ✅ Ctrl+K and the toolbar button, by name and by URL, arrow-key navigation with wrap, click/Enter to open, empty state, Escape |
| Global settings | `settings` | ⚠️ request config persistence, timeout actually applied, local proxy, rebindable shortcut — **client certificates (mTLS) are untested** |
| Admin | `admin`, `import-export` | ⚠️ dashboard, user list, system config round-trip, export/import — **AddUserModal is untested** |
| Extension transport | `extension` | ⚠️ transport works — **`ExtensionInstallPrompt` is untested** |
| Performance | `api-perf` | ✅ endpoint latency budget |
| Request comments | — | ❌ no coverage; FEAT-5.2 (`@` mentions) is not shipped, so `CommentsEditor` has no finished behaviour to pin |
| Google OAuth callback | — | ❌ `OAuthCallbackPage` needs a real Google client; `auth-api` covers the SSO-header path instead |

## Defects this audit turned up

Each was found by a new spec failing first, then fixed.

| # | Defect | Fix | Pinned by |
|---|---|---|---|
| 1 | The Console drawer re-derived request headers from the headers table, so it never showed the `Cookie` header, the resolved `Authorization`, `Content-Type`, anything a pre-request script wrote or removed, and it resolved variables without the local-variable scope. It also logged `resolvedUrl` instead of `finalUrl`, hiding apikey-in-query auth. | `client/src/components/request/UrlBar.tsx` now logs the `reqHeaders` / `finalUrl` that were actually sent | `cookies-console` |
| 2 | Expanding a **form-data** request in the Console put an object into a `<pre>`; React throws on an object child. | same file — the body is stringified before it reaches the store | `cookies-console` |
| 3 | A script's `console.log` was pushed with level `'info'`, which is not in `ConsoleLogEntry.type`'s union (`request \| log \| error \| warn`). | `client/src/sandbox/worker.ts` emits `'log'` | `cookies-console` |
| 4 | **Saving a local variable always failed with a 400.** `LocalVariablesEditor` tags every row with `type`, and `updateLocalVariablesSchema` was `.strict()` without it. The rejection went to `console.error`, so the table still showed the edits and the user had no idea nothing was stored. | `server/src/schemas/localVariables.schemas.ts` now mirrors the user-profile-variables schema; both save handlers raise a toast on success and on failure | `variable-scopes` |
| 5 | **Profile variables were never resolved.** They were editable and persisted, but `resolveAllVariables` only read workspace-local variables, so `{{myProfileVar}}` stayed literal in every request. | `client/src/utils/variables.ts` folds them in above collection/environment and below workspace-local | `variable-scopes` |
| 6 | The Local Variables table seeded its state once at mount, so opening the tab before the fetch landed — or right after a reload — showed an empty table over a populated server. | `LocalVariablesEditor` resyncs when the store's array identity changes | `variable-scopes` |
| 7 | **"Copy to Workspace" on a single request always failed with a 400.** It spread the whole fetched request into the POST, sending seven server-owned fields (`id`, `collectionId`, `order`, `comments`, `createdBy`, `createdAt`, `updatedAt`) at a `.strict()` schema. | `CopyToWorkspaceModal` builds an explicit `createRequestSchema`-shaped payload | `collection-actions` |
| 8 | **Exporting a collection the sidebar had never expanded produced `{"item":[]}`** — the tree is lazy-loaded and the serialiser read straight from the store. | `exportCollection` loads the collection's folders and their requests first, the way `DocumentationModal` does | `collection-actions` |
| 9 | **The workspace Activity / Changelog tab could never show anything.** `GET /workspaces/:id/activity` filters audit rows by `targetId = workspaceId`, but the only workspace-scoped write recorded `targetId = request._id`. | `server/src/routes/collections.ts` logs the workspace as the target and keeps the request id in `details` | `group-scripts-activity` |
| 10 | Dropping a tab did nothing whenever a `dragleave` fired first — which it does as soon as the pointer crosses into any child element, such as the method label or close button. This was also the suite's one flaky test. On top of that, `dragOverTabId` was write-only: nothing rendered a drop indicator, so a dragging user got no cue at all. | `RequestTabBar` derives the drop side from the drop event itself; `handleDragLeave` ignores crossings into the tab's own children; and an insertion line now renders from that state (`data-drop-pos`) | `tabs` (3/3 clean repeat runs) |
| 11 | Every fresh connection tab opened on a bogus "Disconnected" line — React's dev-mode double-invoked effects run the unmount cleanup once, and `disconnect()` logged unconditionally. | `ConnectionEditor` only logs when there was a transport (or a live Kafka stub) to tear down | `connections` |

Dead files deleted:

* `client/src/components/collection/CollectionVariablesModal.tsx` — superseded by `GroupEditModal`'s
  Variables tab; imported nowhere.
* `client/src/components/collection/RunnerModal.tsx` — superseded by `CollectionRunnerModal`; imported
  nowhere. Both made the feature surface look larger than it was.
* `tests/socket-events.spec.ts` — sat outside `testDir` (`./tests/e2e`), so Playwright never loaded it,
  and it would not have compiled if it had: its body had no `test()` wrapper and referenced an
  out-of-scope `browser`. It also still used the native-`dialog` pattern UI-1 removed. The working
  `tests/e2e/socket-events.spec.ts` is unaffected and remains SOCK-2's evidence.

Two flaky specs were also stabilised, both by removing a real race rather than by adding a timeout:
`tabs.spec.ts` (defect 10 above) and `share.spec.ts`, which asserted the post-revoke 404 immediately
after clicking Revoke and sometimes beat its own `DELETE /share/:shortId` to the server — it now waits
on that response. Each was re-run three times clean.

Stale documentation corrected in `README.md`: the four "A single suite" example paths did not exist, and
the paragraph below them claimed `webServer` was commented out and that CI does not run Playwright —
both untrue since TEST-1/TEST-2 shipped.

## Known limitations found but deliberately left alone

These are real, reproducible, and out of scope for a coverage pass — each needs a product decision, not
a test.

* **`pm.response` is a plain object.** It exposes `code`, `status`, `body` and friends, but Postman's
  `pm.response.to.have.status(200)` / `.to.be.ok` chain is not implemented, so the single most common
  idiom in real collections throws. Scripts must use `pm.expect(pm.response.code)`. Implementing part of
  the chain would be worse than implementing none.
* **Global search only sees expanded collections.** `GlobalSearchModal` reads `useLoadedTree()`, so a
  collection the sidebar has never opened contributes no folders or requests. `global-search.spec.ts`
  expands on purpose and says so.
* **`duplicateCollection` copies only the loaded tree, one folder level deep** (the code says
  "simplified — one level"). `collection-actions.spec.ts` expands first for the same reason.
* **The export schema URL is the fabricated `https://schema.getreqSpace.com/...`.** README's FEAT-10 owns
  this; it should change when the serialiser moves server-side, not before.
