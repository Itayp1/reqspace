# Task 1 (priority order) — SEC-0: delete the server-side proxy entirely

Source: [`PLANTODO.md`](../PLANTODO.md) item #1 in [`ORDER_TASK.md`](../ORDER_TASK.md).

* **Size:** XL *(revised down from the original estimate — see correction below; most of the abstraction
  layer already shipped)*.
* **Original status (2026-09-25):** "deferred by the owner... do not start any SEC-0 subtask without saying
  so explicitly."

**Correction (2026-09-27): that status is stale.** Since the 09-25 pass, substantial SEC-0 work has actually
landed, undeferred, without the plan being updated:

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

## What's actually still open

1. **`client/src/components/request/UrlBar.tsx:231`** still calls `api.post('/proxy', ...)` directly — the
   one caller SEC-0.2 didn't migrate. This is the main "Send" button path, so it's the highest-traffic
   holdout.
2. **SEC-0.3 (client-driven history write) is not done.** `server/src/routes/proxy.ts` still writes history
   server-side via `saveHistoryEntry` (imported from `routes/history.ts`) whenever a proxied request
   completes. There is no client-driven `POST` history-write endpoint independent of the proxy route.
3. **SEC-0.4 (delete the old routes) is not done.** `server/src/routes/proxy.ts` and
   `server/src/routes/shareProxy.ts` both still exist and are mounted in `server/src/index.ts`
   (`shareProxyRouter` at line 28/228). `undici` is still a live dependency — correctly so, until this step
   actually happens.

## Revised remaining scope

Migrate `UrlBar.tsx`, build the client-driven history-write endpoint (SEC-0.3), then delete `proxy.ts` +
`shareProxy.ts` and drop `undici` (SEC-0.4). This is meaningfully smaller than the original XL estimate now
that 0.2 and 0.7 are mostly done, but still multi-file, touches the app's most-used code path, and needs the
same care the original entry called for:

* **Trap 1:** the response-size cap from FEAT-9 applies to the new history endpoint — it must never accept
  an oversized body just because the server no longer sees the response.
* **Trap 2:** router-mount-order rules still apply if `shareProxy.ts` deletion changes mount order — see
  TODO.md's "Router mount order is load-bearing" note.

## Done when

`grep -rn "api.post('/proxy'\|api/proxy\|shareProxy" client/src server/src` returns nothing, and `undici` is
out of `server/package.json`.
