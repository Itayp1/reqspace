# ORDER_TASK — Reqspace

Everything still open in [`PLANTODO.md`](PLANTODO.md), numbered in the order it currently appears there
(which follows the project's own `SEC → PERF → TEST → UI → FEAT` convention), with size. This is a starting
point for us to re-sort together — not a final priority call.

| # | Task | Size | Note |
|---|---|---|---|
| 1 | SEC-0 — delete the server-side proxy (remaining slice: migrate `UrlBar.tsx`, client-driven history write, delete `proxy.ts`/`shareProxy.ts`) | XL *(revised down from original — 0.2/0.7 mostly shipped)* | Touches the main "Send" path |
| 2 | SEC-10 remainder — broaden rate limiting beyond auth/share routes | S–M | Judgment call on ceiling, not mechanical — this is what we were mid-discussion on |
| 3 | PERF-2 — lazy-load the tree (per-node fetch + in-memory cache so a re-expand never re-fetches) | L | This is what we were mid-discussion on |
| 4 | PERF-3 — cursor pagination on collections/folders/requests list routes + history | L | admin.ts already has the pattern to copy |
| 5 | PERF-4 — remaining N+1s (history GC loop, workspace-clear byte sum; 3 more sites unverified this pass) | L | |
| 6 | PERF-5 — wire the existing `roleCache`/TTL cache into the HTTP path (rbac + system config), not just socket join | M | Cache mechanism already exists, just not reused here |
| 7 | PERF-6 remainder — gzip (`compression` middleware) | S | Smallest item on this list |
| 8 | PERF-7 — client bundle weight (drop `moment` or `date-fns`, per-function lodash, fix misplaced `@types/*`, lazy-load editors, CI bundle budget) | M | |
| 9 | TEST-3 — journey coverage per feature area (most areas still partial; 2 of 14 gaps closed) | XL | |
| 10 | TEST-6 — real scale/perf budgets in CI (query-count based, using the PERF-0 dataset) | M | |
| 11 | UI-4 — accessibility (focus-visible already fixed; aria labels/roles still sparse, no axe scan in CI) | L | |
| 12 | FEAT-5.1 — collection-level RBAC (narrow a workspace role per collection) | L | Prerequisite for 5.2–5.7 per the original plan |
| 13 | FEAT-5.2 — `@` mentions in comments | M | |
| 14 | FEAT-5.4 — collection versioning | L *(ambiguous)* | Needs a decision first: does 5.3's shipped fork/sync-upstream already cover this, or is real version history still wanted? |
| 15 | FEAT-5.5 — pull requests between collections | XL | Depends on the FEAT-5.4 decision |
| 16 | FEAT-5.6 — merge and conflict resolution | XL | Depends on 5.5 |
| 17 | FEAT-5.7 — partner workspaces | L | No dependency on the others — could move anywhere |

**Not on this list:** FEAT-5.3 (fork a collection) — shipped, already removed from open work.

Open questions to resolve together before finalizing an order:
* Do we prioritize security/perf (#1–8) fully ahead of test coverage and features, or interleave based on
  actual risk/impact rather than section?
* #14 blocks #15/#16 on a decision, not on work — worth resolving early even if we don't build it yet.
* #17 has no dependencies — it can slot in anywhere purely based on business priority.
