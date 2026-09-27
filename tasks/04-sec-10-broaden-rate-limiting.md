# Task 4 (priority order) — SEC-10 remainder: broaden rate limiting

Source: [`PLANTODO.md`](../PLANTODO.md) item #2 in [`ORDER_TASK.md`](../ORDER_TASK.md).

* **Size:** S–M.
* **Correction (2026-09-27):** the CSP/HSTS half of this task **is done** — `server/src/index.ts` has a real
  `helmet({ contentSecurityPolicy: {...}, hsts: ... })` config. Monaco is now bundled locally and the
  visualizer no longer loads Handlebars from a CDN, so the three original blockers are cleared.
* **What was still open before this session's edit:** `rateLimit()` was applied to exactly the auth routes
  (`/login`, `/register`, `/google`) plus `routes/share.ts`'s public GET, and separately a global
  `mutationLimiter` (300/min) already covers every `POST`/`PUT`/`PATCH`/`DELETE` under `/api` — but **nothing
  covered `GET`**.

## User direction (2026-09-27)

Set a rate limit high enough that a legitimate, non-attacking user never reaches it — in-memory is enough,
no Redis dependency required for this.

## What was drafted in this session (uncommitted — picked back up here, not yet verified/built)

* A `readLimiter` (`windowMs: 60_000, max: 2000`) mounted in `server/src/index.ts` ahead of the route
  handlers, applied to every `GET /api/*` request — deliberately generous so bulk tree/collection loading in
  a burst stays far under it, but a scripted attacker hammering read endpoints still gets a `429`.
* A companion test added to `server/src/tests/sec10.e2e.test.ts`, firing concurrent batches of `GET
  /api/auth/config` requests until a `429` is observed.
* **Neither of these was built or run before this file was written** — the server build and test run were
  interrupted. Verify both still compile and the test actually passes before considering this done.

## Still a judgment call, not fully mechanical

The `mutationLimiter` (300/min) and the new `readLimiter` (2000/min) are global per-IP ceilings. Confirm they
don't clip a legitimate heavy user — in particular the collection runner
(`CollectionRunnerModal.tsx`, which can fire many requests in a tight burst) and the lazy-tree expand flow
from task 03 above, once that ships. If real usage data suggests either ceiling is too low, raise it rather
than special-case a route.

## Done when

`server/src/index.ts` builds cleanly, `server/src/tests/sec10.e2e.test.ts` passes (including the new GET
test), and a manual/automated check confirms normal bulk usage (e.g. opening a large workspace) never trips
either limiter.
