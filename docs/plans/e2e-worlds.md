# E2E worlds (draft, from inventory-A.md + inventory-B.md, 192 specs)

Finding: ~150 of 192 specs already register their OWN unique user, so they are isolated by user and can share one stack.
Only specs that touch GLOBAL state (admin settings, OAuth config, first-run, migrations, rate-limited login) must be separated.

## Group P: parallel-safe (own user + own workspace per file; run N workers)
| World | Specs (by topic in inventory) |
|---|---|
| W1 Collections & tree | collection*, tree-ops, ui/tree-menu, crud-rename, QA-20, QA-44, QA-62, QA-64b, qa02, context-menu-stays-open, save-as, QA-77 |
| W2 Request editor & send | requests, edgecases, raw-json-body, qa15/41/50, ui/request-editor, editor-layout/placeholder, response*, large-response, fix-I2.x, cors-clear-message, fix-P3.1 (proxy), pm-api, manual-failed-d (requests-http) |
| W3 Scripts (prescript/tests) | scripts, scripts-scope, group-scripts-activity, qa42, qa43, manual-failed-efgi (merge into ONE `scripts.spec`) |
| W4 Variables & environments | environments*, env-*, variable-*, missing-variable-*, profile-variables-cross-workspace, QA-13/14-env, qa66, qa73 |
| W5 Runner | runner*, QA-35, qa-36, runner-iteration-data-vs-profile |
| W6 History & search | history*, fix-K1.3/K4.4/K4.6, global-search*, search-latency, history-* repros |
| W7 Workspaces, RBAC, sharing | workspace*, workspace-invite-links, workspace-duplicate, rbac, permission-toast, QA-47, QA-76, qa-115, share*, fork, fix-M1.4, user-directory-privacy, user-search-full-email |
| W8 Realtime (2 users, 2 contexts) | socket*, connections, sock1-no-refetch, realtime-move, conflict, QA-26x2, comments, QA-46 |
| W9 UI shell | tabs*, tab-method-theme-color, escape-modals, ui/modals-consistency, QA-19, ctrl-s, dirty-indicator, console-resizable, settings*, cookies-console, fix-D12.1/I2.2, fix-I4.4/I4.5 (errors UI), primary-button-contrast, empty-state, r2-01 |
| W10 Import/export | import*, curl-parser, import-export, import-curl-unclosed-quote |

## Group G: global state, run serially on their own stack (or at the end)
| World | Specs | Why |
|---|---|---|
| G1 First-run / setup | first-run-setup, QA-10 | needs a DB with no superadmin; must run alone, first |
| G2 Auth & session | auth, auth-api, auth-types, ui/auth-forms, login-session-cookie-blocked, QA-75, QA-54-65 | login 15/15min, register 10/h rate limits; keep per-test login (no shared storageState) |
| G3 OAuth / SSO | oauth-*, 8 repro oauth files | change admin provider config + mock IdP |
| G4 Admin & server settings | admin*, ui/admin-*, fix-Q*, fix-A5.6, redis-settings, system-backup, QA-28/30-31, admin-env-ux, admin-sees-all-workspaces, fperror-resolve-audit, errors-console, toast-on-closed-modal | mutate global config / admin lists |
| G5 Platform | electron-*, extension, migrations (fix-R3.x), fix-R2.5, fix-R6.6, get-app-download, load-test, perf-*, api-perf, api-authorization, concurrency | own projects, heavy, or DB-wide |

## Cleanup rules
- Dissolve `manual-failed-*`, `manual-pass-bugs`, `fix-*` and `reproductions/` into the world spec they belong to (one spec file per world sub-area; reproductions stay as a named `describe` inside it).
- One `scripts.spec` (prescript + test scripts + group scripts) instead of ~8 files.
- Keep `tests/e2e/<world>/` folders instead of reproductions/ui split.

## Parallelism (high level)
- Simplest: reuse `scripts/run-e2e-targets.js --shards`: each shard = own stack (own ports + own DB). Assign W1-W10 to shards, run G1 alone first, then G2-G5 on one shard each.
- Alternative inside one stack: `workers: N` with files already using unique users. Risk: register rate limit (10/h per IP; specs use X-Forwarded-For), CPU on one Node API.
- shared `storageState` fits W1-W10 only (per-world admin/user seeded in setup); never G1-G3.

## Open questions
- Is a shared user per world OK, or keep register-per-file (isolated, slower)?
- Postgres/mysql projects: same worlds, or sqlite only for the fast loop?
