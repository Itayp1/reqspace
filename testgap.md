# Test Stabilization — Gaps, Status & Detailed Spec

Continuation of `plantest.md`. This file tracks (1) which `tests/e2e/*.spec.ts`
files are done/verified, (2) which remain, and (3) **feature gaps** found along
the way — cases where a test's premise requires app behavior that doesn't exist
yet, and a product decision (build it vs. adjust the test) is needed before that
file can be finished.

**As of this session** it also carries a full, line-by-line **spec (אפיון)** for
all 8 remaining files, produced by reading the actual app code rather than by
running the tests. Every claim below cites a `file:line` that was actually
opened. Anything that could not be settled from source is marked
**UNVERIFIED** and needs an observed run.

> **No tests were executed during the spec pass.** The verdicts below are
> static-analysis verdicts. They are high-confidence (each is anchored to real
> source), but the 3×-clean-run protocol still applies before any file is
> called done.

---

## Done — fixed and verified stable (3 consecutive clean runs each)

- `auth.spec.ts`
- `collection.spec.ts`
- `concurrency.spec.ts`
- `conflict.spec.ts`
- `crud-rename.spec.ts`
- `edgecases.spec.ts`
- `environments.spec.ts`
- `history.spec.ts`
- `import-export.spec.ts`
- `rbac.spec.ts`
- `requests.spec.ts`
- `response.spec.ts`
- `runner.spec.ts`

`client-proxy.spec.ts` was **deleted** (user decision): it tested a server-side
HTTP proxy relay (`POST /api/proxy`) that was never implemented — no route, and
no client transport ever reads `localProxy`. See "Resolved gaps" below.

---

## Coverage accounting — the file list was incomplete

`tests/e2e/` contains **27 spec files / 62 tests**. The Done + Remaining lists
above and below account for only 21 of them. **Six files have never been
triaged and are not mentioned anywhere in this document's history:**

| file | tests | last touched by | working-tree status |
|---|---|---|---|
| `admin.spec.ts` | 2 | `682bb80` fix(e2e): resolve flaky admin login & config update tests | clean |
| `api-authorization.spec.ts` | 2 | `8aafc62` feat: Chrome extension install + import/export | clean |
| `api-perf.spec.ts` | 1 | `4f45c58` fix(auth): enforce allowSelfRegistration | clean |
| `auth-api.spec.ts` | 2 | `c965de2` chore: major e2e testing rewrite | clean |
| `extension.spec.ts` | 1 | `eeb0242` FEAT-6 to FEAT-9 | clean |
| `fork.spec.ts` | 2 | `1fa85af` Fix fork/auto-sync bugs and add regression coverage | clean |

All six are unmodified in the working tree — i.e. untouched by this
stabilization effort. **This is very likely a large part of the "+20 did not
run" mystery** (see that section below). They must be added to the triage queue.

### Infrastructure findings (cross-cutting, found during the spec pass)

1. **`npm run test:e2e` does NOT wipe the DB.** `playwright.config.ts:28-32`
   asserts *"DB wiping for non-sqlite backends happens in `scripts/wipe-db.js`,
   run as a separate step BEFORE `playwright test` (see package.json's
   test:e2e)"* — but `package.json`'s `test:e2e` is literally just
   `playwright test`. The wipe is never invoked. Harmless for sqlite (a fresh
   uniquely-named file per run, `playwright.config.ts:24`), but **postgres and
   mysql runs start against a dirty DB**. Either fix the script or fix the
   comment.

2. **The local and CI servers are not the same server.** Locally
   `playwright.config.ts:92-100` starts the server with
   `NODE_ENV=test`, `ALLOW_DEFAULT_ADMIN=true`, `ADMIN_PASSWORD=admin`. In CI,
   `.github/workflows/test.yml:61-64` pre-starts the server with
   `NODE_ENV=development` and **none** of those variables, and
   `reuseExistingServer` is `true` under CI — so Playwright reuses that
   different server. This is exactly why `socket-events.spec.ts:9-18` carries an
   `admin123456` fallback login. Worth unifying.

3. **`extension.spec.ts` is a Step-3 blocker.** It uses
   `chromium.launchPersistentContext('', { headless: false, … })`
   (`extension.spec.ts:11-19`) — a real headed Chrome window with an unpacked
   extension. The `sqlite` project has **no `testMatch`**
   (`playwright.config.ts:61-64`), so a full `--project=sqlite` run picks it up;
   CI then runs it a **second** time via `--project=extension`
   (`test.yml:92`). Decide before Step 3 whether to exclude it from the `sqlite`
   project.

4. **The config's own comment is stale**: `playwright.config.ts:37-38` says
   *"with 36 tests hitting a single dev server"* — the real count is 62.

5. `tests/e2e/global-setup.ts` is deleted in the working tree and
   `playwright.config.ts` no longer references `globalSetup` — consistent, no
   action needed.

---

## Cross-cutting facts (verified once — every file below relies on these)

These were each confirmed by reading source, and they explain the *majority* of
the remaining failures. Referenced below as **X1**–**X12**.

| # | Fact | Evidence |
|---|---|---|
| **X1** | **There is no `window.prompt` / `window.confirm` anywhere in `client/src`.** Every "name this thing" flow mounts a React modal via `createRoot`, with testids `prompt-input` / `prompt-submit` / `prompt-cancel`. Confirms use `confirm-btn` / `confirm-cancel-btn`. **Every `page.on('dialog')` / `page.once('dialog')` in the remaining specs is dead code that never fires.** | `client/src/utils/dialog.tsx:47-69`, `common/PromptModal.tsx:53,63,71`, `common/ConfirmModal.tsx:56,63` |
| **X2** | The `tab-*` testid prefix **collides**. Four sites emit it: `tab-collections` / `tab-environments` / `tab-history` (always-rendered sidebar `<button>`s carrying `role="tab"`) and `tab-${tab.tabId}` (request tabs — plain `<div>`, no role). The sidebar renders **first** in DOM order. So `[data-testid^="tab-"]` resolves to `3 + N` elements with the buttons at `nth(0..2)`. Disambiguator: **`:not([role="tab"])`**. | `Sidebar.tsx:98-124`, `RequestTabBar.tsx:98-119`, `MainLayout.tsx:47-52` |
| **X3** | Auth is an **httpOnly cookie named `token`**, never a localStorage Bearer. `authenticate()` reads only `req.cookies?.token`. `Authorization: Bearer …` is never read by the server. The client axios instance is `withCredentials: true` with no token header. | `server/src/middleware/auth.ts:48-53,140-143`, `client/src/api/axios.ts:4-7`; `requestStore.ts:104` even carries the comment *"SEC-4: never let credentials sit in localStorage"* |
| **X4** | **No `storageState` is configured**, so every Playwright test gets a fresh browser context. `test.describe.configure({mode:'serial'})` controls ordering/abort only — it does **not** share cookies. Every test needs its own login. | `playwright.config.ts:47-57` |
| **X5** | Request sub-tab testids are generated as `` `req-tab-${tab.toLowerCase().replace(/\s+/g,'-')}` `` — **spaces become hyphens**. Valid: `req-tab-params`, `req-tab-authorization`, `req-tab-headers`, `req-tab-body`, `req-tab-pre-request-script`, `req-tab-tests`, `req-tab-comments`, `req-tab-settings`. | `RequestEditor.tsx:11-20,72` |
| **X6** | Action-menu testids are generated as `` `action-menu-${label.replace(/\s+/g,'-').toLowerCase()}` ``. So the real names are `action-menu-new-request`, `action-menu-new-folder`, `action-menu-edit`, `action-menu-share-via-link`. | `CollectionExplorer.tsx:99,350-358,536-566` |
| **X7** | Collections and folders default to **collapsed** (`useState(false)`) on every fresh render, and children render only under `{isOpen && …}`. `openCollection()` is called **only** by the store's `createFolder`/`createRequest`; anything that bypasses the store (`SaveRequestModal`, socket broadcasts) leaves the node collapsed. | `CollectionExplorer.tsx:291,629,1070`, `collectionStore.ts:400,467`, `SaveRequestModal.tsx:71` |
| **X8** | `SaveRequestModal`'s root is `fixed inset-0 … z-[100]` — a **full-viewport overlay**. Playwright's `isVisible()` is *not* occlusion-aware (returns `true` for elements behind it), but `.click()` runs a hit-target check and **times out**. Any test that clicks the sidebar while the save modal is open will hang for 30s. | `SaveRequestModal.tsx:108` |
| **X9** | Monaco's auto-closing pairs mangle literally-typed `(`, `)`, `"`, `{`. The established working pattern is `Control+A` → `navigator.clipboard.writeText(...)` → `Control+V`. Clipboard permissions are already granted. | `playwright.config.ts:56`; pattern in `scripts-scope.spec.ts:38-41` |
| **X10** | Socket.io: path `/ws`, room name `'workspace:' + workspaceId`, handshake auth reads `socket.handshake.headers.cookie` and `jwt.verify`s the `token=` pair. `emitToWorkspace(workspaceId, …)` **silently no-ops when `workspaceId` is falsy** — the single most dangerous helper in the codebase. | `server/src/index.ts:61,71-86,106-124`, `server/src/socketUtils.ts:18-22` |
| **X11** | The browser transport does a **direct `fetch(url)`** — there is no proxy. Mock the real target URL, never `**/proxy`. Its response shape is `{status, statusText, headers, body, isBase64, responseTime, size}` — **there is no `code` field**. | `client/src/transport/browser.ts:42,67-75` |
| **X12** | `response-status` renders `` `${status} ${statusText}` ``. Asserting `"200 OK"` therefore requires `statusText === 'OK'` — and **under HTTP/2 `fetch().statusText` is the empty string**, rendering `"200 "`. Playwright's `route.fulfill({status:200})` does set `OK`. | `ResponseViewer.tsx:250-252`, `browser.ts:69` |

---

## Remaining — detailed spec per file

Ordered by recommended execution order.

### 1. `scripts.spec.ts` — 4 tests, **all 4 currently broken**

Sandbox facts established for this file:

- **S1** Each `executeInSandbox` call builds a **brand-new Worker** and terminates
  it, so pre-request and test scripts never share scope — `scripts.ts:41,46,89`.
- **S2** All pre-request scripts (collection + folder chain + request) are
  **concatenated with `\n\n` into one string** and run in a **single** sandbox
  invocation, in collection → outer folder → … → request order —
  `UrlBar.tsx:132-164`.
- **S3** A thrown error posts `{type:'error'}`, which the host **resolves as a
  fake failed test row** named `'Script Execution'` instead of rejecting —
  `worker.ts:130-132` → `scripts.ts:88-90`.
- **S4** **The pre-request script's return value is discarded entirely** —
  `await runPreRequestScript(...)` at `UrlBar.tsx:164` does not assign the
  result. Combined with S3, **a broken pre-request script is 100% invisible**:
  no throw, no console entry, no test row, request goes out unmodified.
- **S5** `worker.onmessage` destructures a `request` field the host **never
  sends**, so `pm.request` is permanently `undefined` — `worker.ts:28` vs
  `scripts.ts:128`.
- **S6** `chai@^6.2.2`; `expect(1).to.eql(2)` produces exactly
  `expected 1 to deeply equal 2` (verified by executing it against the installed
  copy).
- **S7** The env/request editors are mounted conditionally
  (`isEnvTab ? <EnvironmentTabEditor/> : <RequestEditor/>`), so switching tab
  types unmounts/remounts them — `AppScreen.tsx:46-50`.

#### Test 1 — `Pre-request script sets environment variable`

| step | test expects | code reality | verdict | fix |
|---|---|---|---|---|
| register | `register-*` | standard | ✅ | — |
| `tab-environments` | sidebar panel | `Sidebar.tsx:113` | ✅ | — |
| `page.once('dialog')` for the env name | native prompt | `handleCreateEnv` → `customPrompt` → React modal (`EnvironmentSidebar.tsx:18-21`, X1) | ❌ | `prompt-input`.fill('Test Env') + `prompt-submit`.click. Note the input is pre-filled with `"New Environment"`; `.fill()` replaces it |
| `new-env-btn` | — | `EnvironmentSidebar.tsx:73` | ✅ | — |
| `env-node-Test Env` | — | `` `env-node-${env.name}` `` `EnvironmentSidebar.tsx:116` | ✅ | — |
| `env-select` contains/selects | — | `TopBar.tsx:129,132,136-138` | ✅ | — |
| `new-tab-btn`, `request-url-input` | — | `RequestTabBar.tsx:150`, `UrlBar.tsx:524` | ✅ | — |
| **`req-tab-pre-request script`** (space) | — | real id is `req-tab-pre-request-script` (X5) | ❌ | rename — **3 occurrences: L40, L109, L130** |
| `keyboard.type('pm.environment.set("myvar","123");')` | — | Monaco auto-close (X9) | ⚠️ | paste instead |
| `response-status` = `200 OK` | — | hits **real httpbin.org** (X11/X12) | ⚠️ | mock, see below |
| `env-var-key-0`=`myvar`, `env-var-current-0`=`123` | — | `EnvironmentTabEditor.tsx:196,221`; `pm.environment.set` appends `{key, initialValue, currentValue}` to the **active** env (`scripts.ts:49-61`); a new env starts `variables: []` so the write lands at index 0 | ✅ *(given the above fixed)* | — |

**Why the last step works despite a stale-state hazard.** `EnvironmentTabEditor`
seeds `localVars` from `useState(env?.variables || [])` (`:21`) and only re-syncs
in a `useEffect` keyed on `[envId]` (`:26-32`). The test navigates env-tab →
request-tab → env-tab, so the component **unmounts and remounts** (S7) and the
initializer re-reads the store. **Latent bug worth recording:** if the env tab
were already active while a script wrote to it, the table would silently not
refresh. (Same root cause as the socket-advanced finding below.)

Also: `pm.environment.set` only mutates the **client Zustand store** — there is
no `PUT /environments/:id`. The assertion is UI-only, which is fine, but the
value is lost on reload.

#### Test 2 — `Failing assertions display correctly`

| step | test expects | code reality | verdict | fix |
|---|---|---|---|---|
| `page.goto('/')` with a session | — | fresh context, **no login** (X4) | ❌ | add a full registration block |
| `req-tab-tests` | — | correct (X5) | ✅ | — |
| typed chai script | — | Monaco auto-close (X9) | ⚠️ | paste |
| `response-tab-test_results` | — | `` `response-tab-${tab}` ``, list includes `'test_results'` — `ResponseViewer.tsx:226,231` | ✅ | — |
| 2 × `test-result-item` | — | `ResponseViewer.tsx:513-514` | ✅ | — |
| order nth(0)=FAIL, nth(1)=PASS | — | `pm.test` **pushes in execution order** (`worker.ts:53-60`), rendered in array order | ✅ **order is guaranteed** | — |
| `test-result-name` / `-status` | — | `ResponseViewer.tsx:516-519` | ✅ | — |
| text `expected 1 to deeply equal 2` | — | chai 6.2.2 produces exactly that (S6); rendered at `:521-524` only when `!passed && error` | ✅ **exact string confirmed** | — |

#### Test 3 — `pm.sendRequest behavior` — **triply broken, has never passed**

| step | test expects | code reality | verdict | fix |
|---|---|---|---|---|
| session | — | no login (X4) | ❌ | add registration |
| `req-tab-pre-request space` | — | X5 | ❌ | rename |
| **`res.code` === 201** | — | sendRequest results are forwarded **raw** (`scripts.ts:102`) and spread verbatim (`worker.ts:18`); the transport has **no `code`** (X11). The *test-phase* response **is** remapped to `code` (`scripts.ts:118-125`) — but `sendRequest` is not | ❌ **product inconsistency** | prefer **(b)**: normalize `sendRequest` results the same way, keeping `status` as an alias. (a) would be to change the test to `res.status` |
| **`pm.environment.set('sr_code',…)` lands somewhere** | — | `scripts.ts:50-52` targets the **active** env; with none selected `activeEnv` is `undefined` and the write is **silently dropped**. The test never selects an env | ❌ | select an env first, or use `pm.globals.set`, which does have a default target (`scripts.ts:62-73`) |
| after `tab-environments`, `env-var-key-0` visible | — | `tab-environments` only switches the **sidebar panel** (`Sidebar.tsx:113,136`). It does **not** open an env tab, so `EnvironmentTabEditor` is never mounted (S7) and `env-var-key-*` is not in the DOM | ❌ | click the `Globals (Common)` row (`EnvironmentSidebar.tsx:82-89`) — **which currently has no testid; one must be added** (see app-bug B-5) |
| pending `sendRequest` resolves before `result` | — | `checkDone` polls `callbacks.size` every 50 ms and only then posts `result` — `worker.ts:121-128` | ✅ **premise sound** | — |

> The test's own comment ("Assuming Globals is there by default") contradicts the
> script it writes, which uses `pm.environment.set`, not `pm.globals.set`.

#### Test 4 — `Script isolation`

| step | test expects | code reality | verdict | fix |
|---|---|---|---|---|
| session | — | no login (X4) | ❌ | add registration |
| `req-tab-pre-request space` | — | X5 | ❌ | rename |
| typed script | — | X9 | ⚠️ | paste |
| **`var` from the pre-request script invisible to the test script** | — | **two independent mechanisms**: a separate `new SandboxWorker()` per phase (S1), *and* `var` is scoped to the `new Function` body (`worker.ts:100-106`), not to worker global scope | ✅ **the assertion is genuinely valid** | — |
| nth(0) = PASS | — | single `pm.test` | ✅ | — |

#### Network dependency (stability risk for all 4 tests)

All four send a real request to `https://httpbin.org/get`; Test 3 additionally
calls `https://httpbin.org/status/201`. Two failure modes: **(a)** httpbin
downtime/rate-limiting; **(b)** HTTP/2 makes `statusText` empty, so
`response-status` renders `"200 "` and `toContainText('200 OK')` fails **even on
a successful request** (X12).

```ts
await page.route('https://httpbin.org/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ url: route.request().url() }),
}));
```

Test 3 needs a second route returning `status: 201`.

#### Change list for `scripts.spec.ts`

1. Add a registration block to tests 2, 3, 4 (X4).
2. `req-tab-pre-request space` → `req-tab-pre-request-script` (L40, L109, L130).
3. Replace the `page.once('dialog')` env-name handler with `prompt-input` /
   `prompt-submit` (L21-25).
4. Replace every `keyboard.type` of a script body with clipboard paste (X9).
5. `page.route('https://httpbin.org/**')` in all four tests.
6. Test 3: open the Globals tab explicitly (needs the new testid B-5), and settle
   `res.code` vs `res.status` (prefer the app-side normalization).

---

### 2. `scripts-scope.spec.ts` — blocked on the `req` gap (**decision made: build it**)

#### Current state

Everything in this file **except the `req` API** already matches the code:

| element | verdict | evidence |
|---|---|---|
| `new-workspace-btn` + `prompt-input`/`prompt-submit` | ✅ correct — uses `customPrompt` | `Sidebar.tsx:61-65` |
| `new-collection-empty-btn` + in-app prompt | ✅ correct (renders only when the workspace has no collections, which holds here) | `CollectionExplorer.tsx:1054`, `:987-996` |
| `node-container`, `action-menu-btn` | ✅ | `CollectionExplorer.tsx:80,237,366,588` |
| `action-menu-edit` / `-new-folder` / `-new-request` | ✅ (X6; those labels exist on both the collection and folder menus) | `CollectionExplorer.tsx:99,350-358,536-544` |
| `group-edit-prerequest-tab`, `group-prerequest-editor`, `group-edit-save-btn` | ✅ | `GroupEditModal.tsx:86,142,160` |
| `req-tab-pre-request-script` (hyphen) | ✅ **this file has it right** | X5 |
| `node-Scope Collection/Folder/Request` | ✅ | `CollectionExplorer.tsx:263,400,612` |
| clipboard-paste into Monaco | ✅ matches the established pattern | `playwright.config.ts:56` |
| mocking `https://example.com/**` instead of a proxy | ✅ correct | X11 |
| **`req.headers.set` / `req.variables.set`** | ❌ **does not exist** | `worker.ts:35-94` exposes only `pm`, `reqSpace`, `console`, `require` |

**Failure mechanics today:** `req` is an unbound identifier → `ReferenceError`
inside `fn(...values)` (`worker.ts:112`) → caught at `:130` → `{type:'error'}` →
host resolves a fake failed result (S3) → and for a pre-request script that
result is **discarded outright** (S4). The request goes out unmodified and the
test fails on the header assertions with **no diagnostic anywhere**.

One extra hazard: clicking `group-prerequest-editor` clicks the wrapper `<div>`,
not Monaco's hidden textarea — `GroupEditModal.tsx:142` wraps `<ScriptEditor>`
whose own `monaco-editor-container` is nested inside (`ScriptEditor.tsx:28`).
Whether the subsequent `Ctrl+A`/`Ctrl+V` reaches Monaco depends on click-through
focus — **UNVERIFIED**; if the paste is flaky, target the inner container.

#### Feature spec — the `req` object (Option 1, decided)

**Goal.** Let pre-request scripts at any scope level (a) inject headers into the
outgoing request and (b) define variables that resolve in the URL/headers/body of
*this* run.

**API surface (minimum for the test):**

```js
req.headers.set(name: string, value: string): void
req.variables.set(key: string, value: any): void
```

Cheap coherent additions on the same plumbing: `req.headers.get/remove`,
`req.variables.get`.

**Key insight — this is far cheaper than the original estimate.** Two pieces of
plumbing already exist:

- **R1** `localVariables` (a `Map`) is passed **by reference** from
  `UrlBar.tsx:161` into `runPreRequestScript` (`:164`) *and* into
  `resolveAllVariables` (`:167`), where it has the **highest precedence** of all
  variable sources (`variables.ts:90-95`). **Nothing currently ever writes into
  it.** So `req.variables.set` is just a write into that Map — the URL then
  resolves with zero further wiring.
- **R2** `variableWrites` is already a generic `{scope, action, key, value}[]`
  (`worker.ts:31`) with a host-side dispatcher keyed on `scope`
  (`scripts.ts:48-77`). Adding the scopes `'header'` and `'local'` needs **no
  protocol change at all**, matching the existing `'reqSpace'` precedent.

The worker↔host protocol as it actually exists today:

| direction | message | site |
|---|---|---|
| host → worker | `{type:'run', phase, script, response, variables}` | `scripts.ts:128` |
| host → worker | `{type:'sendRequestResult', id, response?, error?}` | `scripts.ts:95,102,105` |
| worker → host | `{type:'result', variableWrites, testResults, consoleLines, visualizer}` | `worker.ts:123` |
| worker → host | `{type:'error', error}` | `worker.ts:131` |
| worker → host | `{type:'sendRequest', id, request}` | `worker.ts:65` |

**Change 1 — `client/src/sandbox/worker.ts`.** Add to `sandboxScope` (alongside
`pm`/`reqSpace`, `:74-94`):

```ts
req: {
  headers: {
    set: (name: string, value: any) =>
      variableWrites.push({ scope: 'header', action: 'set', key: String(name), value: String(value) }),
    remove: (name: string) =>
      variableWrites.push({ scope: 'header', action: 'unset', key: String(name), value: null }),
    get: (name: string) => request?.headers?.[name],
  },
  variables: {
    set: (key: string, value: any) =>
      variableWrites.push({ scope: 'local', action: 'set', key: String(key), value }),
    get: (key: string) => variables?.local?.[key],
  },
}
```

`keys`/`values` are derived from `Object.keys/values(sandboxScope)`
(`:96-97`) and fed to `new Function`, so `req` becomes an in-scope identifier
automatically. Widen the `variableWrites` scope type at `:31`.

**Change 2 — `client/src/utils/scripts.ts`.**
1. Extend `ScriptResult` (`:8-12`) with `headerWrites?: Record<string,string>`
   and `removedHeaders?: string[]`.
2. Handle the new scopes in the dispatcher (`:48-77`): `'header'` accumulates
   locally; **`'local'` → `options.localVariables?.set(w.key, String(w.value))`**
   — this is the crux (R1).
3. Return them in the `resolve(...)` at `:83-87`.
4. **Fix the silent-error path (S3 + S4).** On `{type:'error'}` (`:88-90`) also
   push a console entry via `useConsoleStore`. And in `UrlBar.tsx:164`
   **capture** the pre-request result and merge its `testResults` into what goes
   to `setResponseForTab` (`UrlBar.tsx:292-304`), so a broken pre-request script
   shows up as a red row. **Without this, every future `req`-API bug is as
   invisible as today's.**
5. `runPreRequestScript` (`:132-135`) already returns the `ScriptResult`
   verbatim — no signature change.

**Change 3 — `client/src/components/request/UrlBar.tsx`.**
1. Capture the result at `:164`. `localVariables` is then populated **before**
   `resolveAllVariables` runs at `:167`, so
   `https://example.com/{{colVar}}/{{folderVar}}` resolves correctly.
2. Apply header mutations **after** the whole header-assembly block — i.e. after
   the auth / content-type branches end at `:235`, immediately before
   `reqPayload` is built at `:241`:
   ```ts
   if (preResult?.headerWrites) Object.assign(reqHeaders, preResult.headerWrites);
   preResult?.removedHeaders?.forEach(h => { delete reqHeaders[h]; });
   ```
   Last-position placement makes script-set headers win over auth and the
   auto-set `Content-Type`, matching Postman semantics.
3. Merge `preResult.testResults` into the final `testResults`.

**Precedence — already correct, for free.** The test writes `colVar` at
collection level and `folderVar` at folder level and needs both. Because all
pre-request scripts are concatenated in collection → folder → request order and
run in **one** sandbox (S2), `variableWrites` is naturally ordered, and applying
them sequentially into the Map gives **last-write-wins = request > folder >
collection**. No per-level bookkeeping required.

⚠️ **Edge case in the concatenation itself:** `preScripts.join('\n\n')`
(`UrlBar.tsx:164`) means a collection script ending in an unterminated
expression, or whose last line is a `//` comment without a trailing newline, can
**swallow the folder script**. Consider joining with `';\n\n'`. Wrapping each
level in its own IIFE would additionally give real per-level scope isolation —
but that **changes existing behaviour** (today a collection-level `var` is
visible to the request-level script), so treat it as a separate, explicitly
decided change, not a silent side effect.

**Persistence — recommendation: request-scoped only, do NOT persist.**
`req.variables.set` should live only for the duration of the send:

1. **`SqlFolder` has no `variables` column at all** — folders store only `name`,
   `description`, `preRequestScript`, `testScript`, `roles`, `order`
   (`server/src/db/sql-models/index.ts:62-74`).
2. `updateFolderSchema` is `.strict()` with no `variables` key
   (`server/src/schemas/collections.schemas.ts:28-35`) → a persisting write would
   400. Persistence needs a model change **plus** a schema change **plus** a
   migration.
3. The UI has no folder-variables surface — `GroupEditModal` renders the
   Variables tab only for `type === 'collection'` (`:76,102`). Persisted folder
   variables would be invisible and un-editable.
4. Postman's own `pm.variables.set` is ephemeral — matches user expectation.
5. Test hygiene: persisting would make each send mutate saved server state,
   reintroducing exactly the cross-file accumulated-state flakiness this whole
   effort is fighting.

Collection-level variables remain persistent via the existing Variables tab
(`GroupEditModal.tsx:102-136`, backed by `updateCollectionSchema.variables` at
`collections.schemas.ts:14`) — that is the intended path for durable values.

**Files to change** — *no server change, no schema change, no migration*:

| file | anchor | change |
|---|---|---|
| `client/src/sandbox/worker.ts` | `:74-94` | add the `req` object |
| `client/src/sandbox/worker.ts` | `:31` | widen the `variableWrites` scope type |
| `client/src/utils/scripts.ts` | `:8-12` | extend `ScriptResult` |
| `client/src/utils/scripts.ts` | `:48-77` | handle `scope: 'header'` / `'local'` |
| `client/src/utils/scripts.ts` | `:83-87` | return `headerWrites` / `removedHeaders` |
| `client/src/utils/scripts.ts` | `:88-90` | surface script errors to the console store |
| `client/src/utils/scripts.ts` | `:102` | *(optional)* normalize `sendRequest` responses to expose `code` |
| `client/src/utils/scripts.ts` | `:128` | *(optional)* actually send the `request` object the worker already expects (S5) |
| `client/src/components/request/UrlBar.tsx` | `:164` | capture the pre-request result |
| `client/src/components/request/UrlBar.tsx` | after `:235` | merge header writes into `reqHeaders` |
| `client/src/components/request/UrlBar.tsx` | `:292` | merge pre-request `testResults` into the response |

**Risks & edge cases**

1. **Header name casing.** The test asserts lowercase keys
   (`x-collection-script`) because `route.request().headers()` normalizes.
   `new Headers()` (`browser.ts:6`) lowercases on the wire, so that is fine — but
   a script setting the same header with different casing twice creates two
   `reqHeaders` entries and last-one-wins becomes `Headers`-dependent.
   **Recommend normalizing to lowercase on write.**
2. **Forbidden headers.** `fetch` silently drops `Host`, `Cookie`, `Origin`,
   `Referer`. A script setting those appears to succeed and has no effect —
   worth a console warning.
3. **`String(value)` coercion.** `req.variables.set('x', {a:1})` stringifies to
   `[object Object]`. Match `pm.environment.set`'s existing behaviour
   (`scripts.ts:58`) and document it.
4. **`localVariables` is also passed to `runTestScript`** (`UrlBar.tsx:290`), so
   pre-request variables are readable via `pm.variables.get` in the test phase.
   Desirable, but confirm the Map outliving the pre-request phase is intended.
5. **Collection Runner.** `localVariables` is threaded through the runner too —
   verify a **fresh Map per iteration**, otherwise `req.variables` leaks across
   iterations. **UNVERIFIED — not inspected in this pass.**
6. **`new Function` scope grows.** Adding `req` shadows a user script's own
   top-level `req`. `var req = …` is fine; `let`/`const req` would throw. Low
   risk, but a behaviour change.
7. **`{type:'error'}` still resolves rather than rejects.** Even after surfacing
   to the console, `handleSend` continues and sends. Deliberate (matches
   Postman's "script failure does not block send"), but make it an explicit
   decision rather than an accident.

---

### 3. `share.spec.ts` — 1 test; server correct, client missing a feature

**One-line verdict:** the server side is fully implemented and correct; the
**client has no revoke UI at all** (hard blocker), roughly half the selectors are
invented, and **three of the "security" assertions currently pass vacuously**.

#### Step-by-step

| # | line | test expects | code reality | verdict | fix |
|---|---|---|---|---|---|
| 1 | 7-11 | `register-*` | `RegisterPage.tsx:74,86,99,108` | ✅ | — |
| 2 | 13 | `workspace-select` | `Sidebar.tsx:48` | ✅ | — |
| 3 | 16-21 | `new-collection-empty-btn` w/ fallback | `CollectionExplorer.tsx:1054` and `:1019` | ✅ the `isVisible()` fallback is sound | — |
| 4 | 22-23 | `prompt-input`/`prompt-submit` | `PromptModal.tsx:53,71` | ✅ | — |
| 5 | 26 | `action-menu-btn.first()` | `CollectionExplorer.tsx:80`; always rendered (`opacity-30 group-hover:opacity-100`, `:622-625`) — **not** hover-gated | ⚠️ works but fragile | scope via `node-container`, as `scripts-scope.spec.ts:33` does |
| 6 | 27 | `action-menu-add-request` | **does not exist**; label is `'New Request'` (`:537`) → **`action-menu-new-request`** (X6) | ❌ | rename |
| 7 | 28 | `request-name-input` | **does not exist anywhere in `client/src`.** `action-menu-new-request` opens the prompt modal (`:537`) and calls `createRequest(...)` directly — it does **not** open the request editor | ❌ | `prompt-input`+`prompt-submit`, then click `node-Share Request` to open it |
| 8 | 29 | `request-url-input` | exists | ✅ | must come *after* opening the node |
| 9 | 30,44 | `save-request-btn` | **does not exist**; real id is **`request-save-btn`** (`UrlBar.tsx:556`) | ❌ | rename |
| 10 | 33 | `auth-tab-btn` | **does not exist**; real id is **`req-tab-authorization`** (X5) | ❌ | rename |
| 11 | 34 | `select.w-full.p-2.border` | the **only** matching `<select>` is `ShareLinkModal.tsx:54-57` — the **"Expires in"** dropdown. `AuthEditor`'s type dropdown has a different class and a real testid **`auth-type-select`** (`AuthEditor.tsx:35-36`) | ❌ 0 matches here; wrong element later | `getByTestId('auth-type-select')` |
| 12 | 35 | `bearer-token-input` | **does not exist**; real id is **`auth-bearer-token`** (`AuthEditor.tsx:59`), bound to `auth.bearer?.token` (`:63-64`) | ❌ | rename |
| 13 | 38 | `tests-tab-btn` | **does not exist**; real id is **`req-tab-tests`** (X5) | ❌ | rename |
| 14 | 39-43 | `.monaco-editor.nth(1)` = "test script is usually second editor" | **false premise.** `RequestEditor` renders exactly one tab body at a time (`:93,108,128`), and `ScriptEditor` has a single `monaco-editor-container` (`:28`). Only **one** Monaco editor is ever mounted → `.nth(1)` never matches → `isVisible()` is false → **the whole block is silently skipped and no test script is ever typed** | ❌ **SILENT NO-OP — the worst kind** | `getByTestId('monaco-editor-container')` + paste (X9) |
| 15 | 47-52 | `action-menu-share-via-link` | ✅ exists (label `'Share via Link'`, `:566`). **Collection menu only** | ✅ | same scoping concern as #5 |
| 16 | 55-56 | `share-link-modal` | `ShareLinkModal.tsx:38`, mounted via the `share-collection` CustomEvent (`:567` → listener `:791` → render `:1151-1157`) | ✅ | — |
| 17 | 59-60 | `share-link-generate-btn` | `ShareLinkModal.tsx:72` | ✅ | — |
| 18 | 63-66 | `share-link-result` non-empty | `:86`, value = `window.location.origin + res.data.url` (`:23`); server returns `url: '/share/'+shortId` (`share.ts:81`) | ✅ | — |
| 19 | 70-71 | shortId from the path | matches | ✅ | — |
| 20 | 73-77 | anonymous `GET /api/share/:shortId` → 200 | baseURL 5173 (`playwright.config.ts:49`), Vite proxies `/api` → 3005 (`client/vite.config.ts:12-16`), route mounted at `/api/share` (`server/src/index.ts:234`), GET has **no** `authenticate` (`share.ts:14`) | ✅ genuinely anonymous (fresh context ⇒ no cookie) | — |
| 21 | 81 | `collection.name` | `share.ts:40-43` | ✅ | — |
| 22 | 84-85 | `requests[0].name` | `share.ts:29-37` via `RequestRepository.findByCollection` (`:52-54`) | ✅ | depends on #7 |
| 23 | 86 | `auth.type === 'bearer'` | `share.ts:36`: `auth: { type: r.auth?.type \|\| 'none' }` | ⚠️ **vacuous today** | meaningful only once #11-12 really set bearer auth |
| 24 | 87 | `auth.bearer?.length` falsy | server emits only `{type}` → always `undefined` → falsy | ⚠️ **passes unconditionally** | also assert the raw token is absent from `JSON.stringify(shareData)` |
| 25 | 88 | `auth.token === undefined` | never emitted | ⚠️ vacuous | as above |
| 26 | 89-90 | `testScript`/`preRequestScript` undefined | whitelist at `share.ts:30-37` omits them structurally | ⚠️ vacuous **and** #14 means no script is ever set | fix #14 first |
| 27 | 93 | `share-link-revoke-btn` | **DOES NOT EXIST.** `ShareLinkModal.tsx` has only generate (`:72`), result (`:86`), copy (`:92`), Cancel (`:68`), Done (`:100`), X (`:42`). A repo-wide grep for `revoke` in `client/src` returns only `URL.revokeObjectURL` and an admin-user revoke | ❌ **HARD BLOCKER — missing feature** | see decision D-1 |
| 28 | 96-97 | revoked → 404 | `share.ts:85-95` `DELETE /:shortId` → `link.destroy()` (**hard** delete) → GET's `findOne` misses → 404 (`:15-18`). Mirrors `server/src/tests/share.e2e.test.ts:106-125` | ✅ server OK | blocked only by #27 |

#### API contract (server truth)

`server/src/routes/share.ts`, mounted at `/api/share` (`server/src/index.ts:234`).
Cross-checked against the **passing** jest test `server/src/tests/share.e2e.test.ts`.

**`GET /api/share/:shortId`** — public, no auth. Rate-limited 100/15min
(`:12`). 404 if missing (`:16`) or expired (`:20`).

```jsonc
{
  "collection": { "name": "...", "description": "..." },   // share.ts:40-43
  "requests": [{                                            // share.ts:30-37
    "name": "...", "method": "...", "url": "...", "description": "...",
    "headers": [ /* keys matching /auth|token|key|secret|cookie|pass/i REMOVED — share.ts:35 */ ],
    "auth": { "type": "bearer" }                            // TYPE ONLY — share.ts:36
  }],
  "expiresAt": "..."
}
```

**Stripping is by whitelist, not by deletion** (`share.ts:30-37`).
`preRequestScript`, `testScript`, `auth.bearer`, `auth.basic`, `body`, `params`
are never in the object at all. This is the strongest possible design — and it is
precisely what makes the test's `toBeUndefined()` assertions pass trivially.

**`POST /api/share/collection/:id`** — authenticated. Note `validate(createShareSchema)`
runs **before** `authenticate` (`:49`). Schema
`z.object({expiresInDays: z.number().nullable().optional()}).strict()`
(`share.schemas.ts:3-5`); `ShareLinkModal.tsx:22` sends exactly that ✅. Requires
editor/owner (`:58-63`). Returns `{shortId, token, expiresAt, url}` with **HTTP
200, not 201** (`:78-82`) — don't "fix" that without updating the jest test.

**`DELETE /api/share/:shortId`** — authenticated, creator-only, 403 otherwise
(`:90`), hard-deletes (`:93`).

#### Vacuous assertions — the real risk in this file

The file is *currently green-able for the wrong reason*. Because step 14 silently
skips and steps 10-12 throw before any auth is set, **the request under test has
no token and no scripts**. Assertions 23-26 then "verify stripping" on data that
was never sensitive. After the rewrite, harden them:

1. Assert the **positive** side first — re-read the request as the authenticated
   owner (`GET /api/requests/:id` via `page.request`) and assert
   `auth.bearer.token === 'super-secret-token-123'` and a non-empty
   `testScript`. *Only then* assert the anonymous view omits them.
2. Whole-payload leak check:
   `expect(JSON.stringify(shareData)).not.toContain('super-secret-token-123')`.
3. Cover the header filter too (`share.ts:35`) — add `X-Api-Key` and assert it is
   gone, mirroring `share.e2e.test.ts:103`.

#### Sequencing risk to watch

`handleSaveClick` (`UrlBar.tsx:357`) re-fetches `GET /requests/:id` and pops a
**"Conflict Detected"** `ConfirmModal` when `remoteReq.updatedAt >
activeRequest.updatedAt` (`:394-401`). Both timestamps must be present for that
branch, so a freshly-created request (whose local stub may lack `updatedAt`, cf.
`CollectionExplorer.tsx:193-205`) normally takes the direct-PUT path. If a
conflict dialog *does* appear, dismiss it with `confirm-btn` rather than
treating it as a product bug — **UNVERIFIED** whether it fires in this sequence.

Also: the save is a **single** PUT carrying `auth`, `testScript` and
`preRequestScript` together (`UrlBar.tsx:379-390`), so one `request-save-btn`
click after setting both is enough — the test's two saves (L30, L44) are
harmless but redundant.

---

### 4. `socket-events.spec.ts` — 1 test, **6 of 13 events never arrive**

#### Event emit matrix (all 13)

| # | expected event | emitted? | server file:line | room | verdict for this test |
|---|---|---|---|---|---|
| 1 | `collection:created` | YES | `routes/collections.ts:126` | `workspace:<params.workspaceId>` | **ARRIVES** |
| 2 | `collection:updated` | YES | `routes/collections.ts:185` | `workspace:<resolvedWorkspaceId>` | **ARRIVES** |
| 3 | `collection:deleted` | YES | `routes/collections.ts:196` | ″ | **ARRIVES** |
| 4 | `folder:created` | YES | `routes/collections.ts:210` | ″ | **ARRIVES** |
| 5 | `folder:updated` | YES | `routes/collections.ts:221` | ″ | **ARRIVES** |
| 6 | `folder:deleted` | YES | `routes/collections.ts:232` | ″ | **ARRIVES** |
| 7 | `request:created` | YES | `routes/collections.ts:255` | ″ | **NEVER FIRES** — the POST 400s (A1) |
| 8 | `request:updated` | YES | `routes/collections.ts:272` | ″ | **NEVER FIRES** — cascades from A1 |
| 9 | `request:deleted` | YES | `routes/collections.ts:281` | ″ | **NEVER FIRES** — cascades from A1 |
| 10 | `workspace:reordered` | YES | `routes/collections.ts:176` | `workspace:<each resolved wsId>` | **NEVER FIRES** — wrong verb+path (A2) |
| 11 | `environment:created` | YES | `routes/environments.ts:62` | `workspace:<params.workspaceId>` | **ARRIVES** |
| 12 | `environment:updated` | YES | `routes/environments.ts:72` | ″ | **NEVER FIRES for a superadmin** — real bug (A3) |
| 13 | `environment:deleted` | YES | `routes/environments.ts:81` | ″ | **NEVER FIRES for a superadmin** — real bug (A3) |

All 13 event-name strings are **singular-noun, colon-separated, exactly as the
test spells them** (`collection:created`, not `collections:created`). There are
also events the test doesn't listen for — `collection:fork-synced`
(`routes/forks.ts:567`), `presence:open`/`presence:close`
(`server/src/index.ts:133,137`) — harmless, extra events are ignored.

#### Step-by-step

| step | test expects | code reality | verdict | fix |
|---|---|---|---|---|
| L8 `localhost:3005/api` | server on 3005 | correct (`playwright.config.ts:96`, `server/src/index.ts:288`) | ✅ | — |
| L9-19 login `admin`/`admin` | works | `loginSchema.email` is `z.string()`, **not** `.email()`, so the non-email string `'admin'` validates (`schemas/auth.schemas.ts:10`; `routes/auth.ts:79-123`). Seeded admin is `ADMIN_EMAIL\|\|'admin'` / `ADMIN_PASSWORD\|\|'admin'` (`server/src/index.ts:306-332`), and `mustChangePassword` is `false` because the expression is `adminPassword==='admin' && NODE_ENV!=='test'` and NODE_ENV **is** `test` (`:325`) | ✅ | the `admin123456` fallback is dead code locally — but see Infrastructure finding #2 for CI |
| L20 raw `set-cookie` as `Cookie:` | works | **by luck**: the `cookie` package splits on `;` and takes the first `k=v`, so `token=…` parses first and `Max-Age`/`Path`/`HttpOnly`/`SameSite` become ignored junk pairs. Login sets exactly one cookie; a second would be joined with `, ` and break this | ⚠️ fragile | optional: `cookieHeader.split(';')[0]` |
| L23-25 `wsList[0]._id` | `_id` exposed | `WorkspaceRepository.ts:29` (`sqlToRecord`) ✅. But `findForUser` is `findAll()` filtered, **no ORDER BY** (`:48-53`). In practice the admin owns only `Admin's Workspace` and no spec invites the admin, so length is 1 | ⚠️ OK in practice, not guaranteed | prefer `wsList.find(w => w.name === "Admin's Workspace")` |
| L28-32 socket opts | `path:'/ws'`, `extraHeaders`, websocket | `extraHeaders` **is** honoured by the Node `ws` client (ignored only in browsers); server reads `handshake.headers.cookie` (`server/src/index.ts:73`) | ✅ | — |
| L34-39 join + 500ms | — | `join:workspace` is async (`getUserWorkspaceRole` + `findById`); admin passes on `isSuperAdmin` (`:106-124`) | ✅ | — |
| L57 `POST /workspaces/:id/environments {name}` | — | `createEnvironmentSchema` = `{name: string.min(1), variables?}.strict()` (`environments.schemas.ts:3-6`) | ✅ emits | — |
| L60 `PUT /environments/:id` | — | schema OK, but the **emit no-ops** | ❌ **A3** | fix server |
| L62 `DELETE /environments/:id` | — | **emit no-ops** | ❌ **A3** | fix server |
| L65/L68 collection create+update | — | `createCollectionSchema` / `updateCollectionSchema` OK (`collections.schemas.ts:3-18`) | ✅ | — |
| L71/L74 folder create+update | — | `createFolderSchema` / `updateFolderSchema` OK (`:20-35`) | ✅ | — |
| **L77** `POST /collections/:id/requests {name,method,folderId}` | — | `createRequestSchema` requires **`url: z.string()` (NOT optional)** and is `.strict()` → **400 Invalid request body** (`collections.schemas.ts:68-80`; `middleware/validate.ts:10-15`) | ❌ **A1** | add `url: 'https://example.com'` |
| L78 | `reqId` from the response | the 400 body is `{message, issues}` → `reqId === undefined` | cascade | — |
| L80 `PUT /requests/undefined` | — | `checkPermission('request')` → `resolveWorkspaceId` null → **404** (`collections.ts:72-73`) | cascade | — |
| **L83** `POST /workspaces/:id/reorder` | — | **no such route.** The real one is **`PUT /api/collections/reorder`** (`collections.ts:133`); `workspaces.ts` has no `/:id/reorder` → 404 | ❌ **A2** | `request.put(\`${apiUrl}/collections/reorder\`, …)` |
| L84 reorder body | `{type,items:[{id,order}]}` | `reorderSchema` matches exactly (`collections.schemas.ts:90-96`) | ✅ once the path is fixed | — |
| L88-92 deletes | — | folder/collection fine; request delete cascades from A1 | partial | — |
| L95 1s settle | — | adequate | ✅ | — |

#### Findings

- **A1 (test-only).** `createRequestSchema` requires `url`; the test omits it →
  400 → kills `request:created/updated/deleted`. Add `url` at L77.
- **A2 (test-only).** The reorder endpoint is `PUT /api/collections/reorder`, not
  `POST /api/workspaces/:id/reorder`. Fix verb + path at L83. Consistent with the
  route-ordering fix already recorded below — the route exists and *does* emit;
  the test simply calls a URL that was never real.
- **A3 (REAL SERVER BUG — see B-6).**

---

### 5. `socket-advanced.spec.ts` — folder rename + globals sync

| step | test expects | code reality | verdict | fix |
|---|---|---|---|---|
| L17-30 register A & B | — | standard | ✅ | — |
| **L33-35** `pageA.once('dialog')` → workspace name | native prompt | `new-workspace-btn` → `customPrompt` → in-app modal (`Sidebar.tsx:61-63`, X1). Handler never fires; the modal stays open | ❌ | `prompt-input`/`prompt-submit` |
| L38-44 invite flow | `workspace-settings-btn`, `workspace-members-tab`, `user-autocomplete-input`, `user-autocomplete-result`, `workspace-invite-btn`, `member-email`, `close-workspace-modal` | **all exist** — `Sidebar.tsx:86`; `WorkspaceSettingsModal.tsx:85,96,184,208`; `UserAutocomplete.tsx:51,69` | ✅ | — |
| L40 autocomplete on `userB_<ts>@example.com` | finds the user | the `_`-escaping bug **is fixed** — raw parameterized query with explicit `ESCAPE '\'`, prefix match `term%` (`UserRepository.ts:122-136`) | ✅ **critical: every email here contains `_`** | — |
| L47-49 B selects the workspace **by label** | — | works (`Sidebar.tsx:46-50`, `value={_id}`), but label-selection is the retry-fragile pattern already flagged below | ⚠️ | select by the `_id` captured from A |
| **L52-53** `once('dialog')` → collection name | — | in-app prompt (`CollectionExplorer.tsx:1054-1055`, X1) | ❌ | `prompt-input`/`prompt-submit` |
| **L58-59** `once('dialog')` → folder name | — | in-app prompt (`CollectionExplorer.tsx:538`, X1) | ❌ | `prompt-input`/`prompt-submit` |
| L57 `action-menu-new-folder` | — | correct (X6) | ✅ | — |
| L64-66 B sees collection → **clicks to expand** → sees folder | — | correct **and necessary** (X7): `folder:created` → `applyFolderUpserted` only fills the store, it expands nothing (`SocketSync.tsx:38`) | ✅ **this file gets expansion right** | — |
| L69-71 dblclick → `inline-rename-input` | — | `onDoubleClick` sits on `node-container`; the `node-*` span is a child so the event bubbles (`CollectionExplorer.tsx:140,599`) | ✅ | — |
| L74 B sees `node-Renamed Folder` | — | `folder:updated` → `applyFolderUpserted` re-renders; B already has it expanded | ✅ | — |
| **L77** `env-globals-btn` | — | **DOES NOT EXIST.** The "Globals (Common)" row has **no `data-testid` at all** (`EnvironmentSidebar.tsx:83-88`); the TopBar equivalent (`TopBar.tsx:177-181`) likewise | ❌ | **app change B-5**; the test must also click `tab-environments` first — that panel is not the default |
| **L78** `env-add-var-btn` | — | **DOES NOT EXIST**; real id is **`add-env-var-btn`** (word order!) — `EnvironmentTabEditor.tsx:247` | ❌ | rename in the test |
| L79 `env-var-key-0` | — | `EnvironmentTabEditor.tsx:196` | ✅ | — |
| **L80** `env-var-val-0` | — | **DOES NOT EXIST**; the two real value columns are `env-var-initial-${i}` and `env-var-current-${i}` (`:211,221`) | ❌ | use `env-var-current-0` (or assert both) |
| L81 `env-save-btn` | — | exists; for the global env it PUTs `/workspaces/:id/global-environment` (`EnvironmentTabEditor.tsx:62-68,166`) | ✅ | — |
| L83-85 **B sees the global var live** | — | the PUT **does** emit `environment:updated` with `{...global, isGlobal:true}` (`routes/environments.ts:45-52`); `applyEnvironmentUpserted` branches on `isGlobal` and replaces `globalEnvironment` (`SocketSync.tsx:48-49`, `environmentStore.ts:52-55`) | ✅ **the sync really works** | — |
| L83-85 ordering caveat | — | `EnvironmentTabEditor` seeds `localVars` in a `useEffect` keyed **only on `envId`** (`:26-32`). B opens the globals tab *after* A saved, so the effect runs once against the already-updated store. **Had B's tab been open beforehand, the inputs would not refresh** | ✅ as written; **latent app bug B-7** | — |
| L84-85 B's `globalEnvironment` non-null | — | fetched on workspace switch (`TopBar.tsx:68-72`) | ✅ | — |

---

### 6. `socket-sync.spec.ts` — conflict indicator

| step | test expects | code reality | verdict | fix |
|---|---|---|---|---|
| L17-30 register A & B | — | fine | ✅ | — |
| **L33-34** `once('dialog')` → workspace name | — | in-app prompt (X1) | ❌ | `prompt-input`/`prompt-submit` |
| L39-47 invite flow | — | all testids exist (same as socket-advanced) | ✅ | — |
| L50-52 B selects by label | — | works; same fragility | ⚠️ | select by `_id` |
| L55 `create-request-btn` | — | `RequestEditor.tsx:33` | ✅ | — |
| L57 `request-save-btn` | — | `UrlBar.tsx:556` | ✅ | — |
| L58 `save-req-name-input` | — | `SaveRequestModal.tsx:122` | ✅ | — |
| **L60-65 creating the collection while the save modal is open** | — | X8: `isVisible()` returns `true` (not occlusion-aware) but `.click()` hits the `inset-0` overlay and **times out** | ❌ | restructure — create the collection **before** clicking `request-save-btn` |
| **L62** `once('dialog')` → collection name | — | in-app prompt (X1) | ❌ | `prompt-input`/`prompt-submit` |
| L67 `save-req-submit-btn` | — | `disabled={!name.trim() \|\| !selectedLocation \|\| loading}`; `selectedLocation` is auto-set by a `useEffect` to `collections[0]` whenever `collections` is non-empty (`SaveRequestModal.tsx:11,14-19,163-164`) | ✅ **once a collection pre-exists** | — |
| L67 (note) | — | the modal's collection rows have **no `data-testid`** (`:139-145`), so a specific collection cannot be picked by testid. Not needed here (auto-select suffices) | gap | app change only if ever needed |
| **L71 B sees `node-Shared Request` without expanding** | — | `request:created` → `applyRequestUpserted` fills the store (`SocketSync.tsx:41`), but the collection renders **collapsed** (X7) so the node is not in the DOM | ❌ | add `await pageB.getByTestId('node-Shared Collection').click()` — **exactly what socket-advanced does at its L65 and this file omits** |
| **L73** `[data-testid^="tab-"]` | — | matches the request tab **plus** `tab-collections`/`tab-environments`/`tab-history` → 4 matches → `toContainText` is a **strict-mode violation** (X2) | ❌ | `:not([role="tab"])` |
| L76-77 A edits + saves | — | for an already-saved request `UrlBar` PUTs a clean payload → `request:updated` emitted (`routes/collections.ts:266-275`) | ✅ | — |
| L76-77 A's own conflict pre-check | no spurious dialog for A | `UrlBar.tsx:394` guards on `remoteReq.updatedAt && activeRequest.updatedAt`; `SaveRequestModal` never copies `updatedAt` onto the tab after the initial save (`:79-93`), so A's is `undefined` and the guard short-circuits | ✅ **by accident** — see latent bug B-8 | — |
| **L80 B shows `conflict-indicator`** | — | mechanism is **sound**: B's tab got `updatedAt` from `GET /requests/:id` (`CollectionExplorer.tsx:214-218` → `setActiveRequest(res.data)`, which sets `tabId = _id`, `requestStore.ts:177-178`); `SocketSync`'s `request:updated` handler finds the tab by `tabId === updatedRequest._id`, compares `remoteTime > localTime`, sets `isConflicted` (`SocketSync.tsx:69-94`, `requestStore.ts:177-206`); `RequestTabBar.tsx:128-130` renders it. **It is NOT gated on the tab being dirty** | ✅ **the assertion would pass** once L71/L73 are fixed | — |

---

### 7. `tabs.spec.ts` — 2 tests, both blocked by the `tab-*` collision

#### Test 1 — `Drag and drop to reorder tabs` (L4-76)

| # | line | test expects | code reality | verdict | fix |
|---|---|---|---|---|---|
| 1 | 10-15 | register | — | ✅ | — |
| 2 | 18 | `create-request-btn` | `RequestEditor.tsx:32-38`, rendered **only** when `!activeRequest` (`:28`), calls `newTab()`. Fresh context ⇒ `request-storage` empty ⇒ `tabs: []` (`requestStore.ts:123`, persist `:377-392`) | ✅ | — |
| 3 | 19 | `request-url-input` | `UrlBar.tsx:524` on `VariableInput`, which spreads `{...props}` onto the real `<input>` (`VariableInput.tsx:119-128`) | ✅ | — |
| 4 | 20 | `request-save-btn` opens the modal | `UrlBar.tsx:556-557` → `handleSaveClick(false)` → `:430-432` (no `_id`) → `:620-622` mounts `<SaveRequestModal>` | ✅ | — |
| 5 | 21 | `save-req-name-input` | `SaveRequestModal.tsx:122` | ✅ spelling correct | — |
| 6 | **23-34** | create a collection **from inside the open save modal** | **BROKEN, 3 independent reasons** ↓ | ❌ | restructure — create the collection *before* opening the save modal |
| 6a | 24 | `isVisible()` guard | `new-collection-empty-btn` renders only when `collections.length === 0` (`CollectionExplorer.tsx:1049-1059`); fresh user ⇒ present. `isVisible()` ignores overlays ⇒ **misleadingly true** | guard passes | — |
| 6b | 25 | `.click()` | X8 — the `inset-0 z-[100]` overlay intercepts ⇒ **30 s timeout** | ❌ hard fail | — |
| 6c | 28-31 | `page.once('dialog')` registered **after** the click | X1 — dead code, and mis-ordered even if it weren't | ❌ | `prompt-input`/`prompt-submit` |
| 7 | 35 | `save-req-submit-btn` | with zero collections the list shows *"No collections found."* (`:134-135`) and `selectedLocation` stays `null` (set only at `:16-18` when `collections.length > 0`) ⇒ **permanently disabled** | ❌ | the collection must exist beforehand |
| 8 | 38-42 | second tab + save | `new-tab-btn` (`RequestTabBar.tsx:150`) → `newTab()`; the modal auto-selects `collections[0]` | ✅ once a collection exists | — |
| 9 | **45-50** | close-all loop | X2 — `tabs.count()` counts the 3 sidebar buttons ⇒ **never reaches 0 ⇒ infinite loop**; and `tabs.nth(0)` is `tab-collections`, which has no `close-tab-btn` ⇒ 30 s timeout on iteration 1 | ❌ hard fail | `:not([role="tab"])` |
| 9b | 48 | `close-tab-btn` | `RequestTabBar.tsx:136-143`, one per tab, always in the DOM. Class is `opacity-50 group-hover:opacity-100` — **opacity, not `hidden`** ⇒ Playwright considers it visible; the `.hover()` at L47 is harmless but unnecessary | ✅ | — |
| 9c | — | closing a **dirty** tab | `RequestTabBar.tsx:80-89`: `tab.isDirty` → `customConfirm` → `ConfirmModal` overlay `fixed inset-0 z-[200]` (`ConfirmModal.tsx:33`) **blocks all further clicks until answered** | ⚠️ conditional | handle `confirm-btn` defensively in the loop |
| 10 | 54-55 | `node-Request 1` / `node-Request 2` | X7 — `SaveRequestModal` bypasses the store (`api.post` directly, `:71`) and relies on the socket broadcast (`:95-97`), so `openCollection()` is never called ⇒ **collection stays collapsed** | ❌ | click `node-Tab Collection` first |
| 11 | 58-63 | count + order | X2 | ❌ | `:not([role="tab"])` |
| 12 | **68** | `tab2.dragTo(tab1)` flips the order | **the drop lands dead-center, which the code resolves to `'after'` — a no-op** ↓ | ❌ **fails even with perfect DnD** | `dragTo(tab1, { targetPosition: { x: 5, y: 10 } })` |
| 13 | 74-75 | order assertion | depends on 12 | ❌ | — |

**Note on tab dirtiness after a modal save:** `SaveRequestModal.handleSave` calls
`setActiveRequest({tabId: activeRequest.tabId, …})` (`:79-93`), which preserves
the dirty flag (`requestStore.ts:189-190`), then `markSaved()` (`:98`) clears it
for `activeTabId` (`requestStore.ts:250-256`). So after a *successful* modal save
the tab is clean. ✔

**The drag-and-drop mechanism in detail.** It is **native HTML5 DnD**, not a
library: `draggable` + `onDragStart/onDragOver/onDragLeave/onDrop`
(`RequestTabBar.tsx:101-105`); `handleDragStart` sets `dataTransfer` and
`draggedTabId` (`:46-50`); `handleDragOver` **computes the drop side from the
cursor x** (`:52-61`):

```js
const rect = e.currentTarget.getBoundingClientRect();
const x = e.clientX - rect.left;
const pos = x < rect.width / 2 ? 'before' : 'after';
```

`handleDrop` **bails out unless `dragOverTabId` was set by a preceding
`dragover`** (`:67-73`), and `reorderTabs(draggedId, targetId, pos)`
(`requestStore.ts:130-145`) splices the dragged tab out *first*, then finds
`targetIdx` in the shortened array, inserting at `targetIdx` (before) or
`targetIdx + 1` (after).

**The decisive bug:** `locator.dragTo(target)` drops at the **center**. At the
center `x === rect.width / 2`, so `x < rect.width / 2` is **false** →
`pos = 'after'`. Trace for `tab2.dragTo(tab1)` on `[tab1, tab2]`: splice out tab2
→ `[tab1]`; `targetIdx = 0`; `'after'` → insert at 1 → **`[tab1, tab2]`,
unchanged**. The assertion can never pass.

If Playwright's synthesized HTML5 DnD proves unreliable in Chromium (**no
in-repo precedent — `dragTo` is used nowhere else in `tests/`**), the fallback is:

```ts
await tab2.hover();
await page.mouse.down();
await tab1.hover({ position: { x: 5, y: 10 } });
await tab1.hover({ position: { x: 5, y: 10 } });   // 2nd move → guarantees dragover
await page.mouse.up();
```

The second move matters — `handleDrop` returns early if `dragOverTabId` is null
(`RequestTabBar.tsx:69`).

#### Test 2 — `drag-reorder only and content persistence` (L78-136)

| # | line | test expects | code reality | verdict | fix |
|---|---|---|---|---|---|
| 1 | 80-86 | register | — | ✅ | — |
| 2 | 89-96 | two tabs with url+method | `method-select` bound to `activeRequest.method` (`UrlBar.tsx:512-515`), url to `activeRequest.url` (`:524-526`) | ✅ | — |
| 3 | 99-100 | `toHaveCount(2)` | **5** (X2) | ❌ | `:not([role="tab"])` |
| 4 | 103-107 | per-tab content persisted | `selectTab` sets `activeRequest = tabs.find(...)` (`requestStore.ts:279-289`) — reads the **stored tab object** | ⚠️ **passes only by luck** ↓ | none for the test; fix the store (B-1) |
| 5 | 110 | `[title="Unsaved changes"]` | `RequestTabBar.tsx:131-133`: `<div data-testid="dirty-indicator" … title="Unsaved changes" />`, rendered when `tab.isDirty && !tab.isConflicted` | ✅ **title is exact** | optional: prefer `getByTestId('dirty-indicator')` |
| 6 | 113-116 | second tab same | — | ✅ | — |
| 7 | 121 | `dragTo` | same dead-center bug | ❌ | `targetPosition` |
| 8 | 128-135 | re-use the `tabs` locator after the drag | Playwright locators are **lazy** — re-queried on every use, so re-resolution after a DOM reorder is correct | ✅ locator usage sound | (still fails because of 7) |

---

### 8. `workspace.spec.ts` — 2 tests, both blocked by the native-dialog assumption

#### Test 1 — `register, login, create, edit, switch and delete a workspace` (L8-53)

| # | line | test expects | code reality | verdict | fix |
|---|---|---|---|---|---|
| 1 | 10-15 | register | — | ✅ | — |
| 2 | **21-22** | `page.on('dialog')` + `new-workspace-btn` | `Sidebar.tsx:60-84`: the handler is `async` and calls `customPrompt('New Workspace', …)` (`:63-65`) → **in-app `PromptModal`** (X1). No native dialog ever fires | ❌ **hard fail — the workspace is never created, so every later step fails** | `prompt-input`.fill + `prompt-submit`.click |
| 2b | 21 | `page.on`, not `once` | a permanent handler for the whole test. Harmless today (nothing fires) but it would swallow **every** dialog, masking failures | ⚠️ smell | drop it |
| 3 | 24 | select contains the name | `Sidebar.tsx:71-72` — `setWorkspaces([...workspaces, newWs])` then `setActiveWorkspace(newWs)` ⇒ appended **and auto-selected** | ✅ logic correct (blocked by 2) | — |
| 4 | 27 | `.inputValue()` is the workspace id | `Sidebar.tsx:50` `value={activeWorkspace?._id \|\| ''}`, options `value={ws._id}` (`:57`) | ✅ **confirmed** | — |
| 5 | 28 | `selectOption(id)` | `onChange` → `setActiveWorkspace` (`:51-54`) | ✅ (no-op; already selected) | — |
| 6 | 31 | `workspace-settings-btn` | `Sidebar.tsx:85-87` | ✅ | — |
| 7 | 32 | `workspace-name-input` editable | `WorkspaceSettingsModal.tsx:124`, `disabled={!isOwner}` (`:129`); `isOwner` = `myRole === 'owner'` (`:78`), set at creation (`Sidebar.tsx:70`) | ✅ | — |
| 7b | 32 | fillable immediately | the modal fetches on mount (`:21-36`) behind a **blocking overlay** `absolute inset-0 z-10` while `loading` (`:111-116`); on resolve `setName(res.data.name)` (`:28`) **overwrites what was typed** | ⚠️ **race** | wait for the overlay to disappear before filling |
| 8 | 33 | `workspace-save-btn` | `:152-154` → `handleUpdate` (`:47-56`) sends `{name, description, isPublic}`. Server `PUT /:id` with `validate(updateWorkspaceSchema)` then `requireWorkspaceRole('owner')` (`workspaces.ts:91`); the `.strict()` schema **does include `isPublic`** (`workspaces.schemas.ts:9-13`) and the route allowlists all three (`:92-98`) | ✅ **the earlier `isPublic` fix is present and correct** | — |
| 9 | 34 | `close-workspace-modal` | `WorkspaceSettingsModal.tsx:85` | ✅ | — |
| 10 | 36 | select shows the edited name | `handleUpdate:50-52` rebuilds `workspaces` + `setActiveWorkspace` | ✅ | — |
| 11 | **39-52** | DELETE via `fetch` + Bearer | the route exists (`DELETE /api/workspaces/:id`, `requireWorkspaceRole('owner')`, cascades collections — `workspaces.ts:104-110`). The `Authorization: Bearer null` header is ignored; the **cookie** authenticates (X3) ⇒ the delete actually **succeeds** | ⚠️ **V-1 — dead code**: wrapped in `try/catch`, result discarded, **zero assertions**. The test title claims "delete a workspace" but nothing verifies it | ↓ |

Recommended replacement for step 11:

```ts
const status = await page.evaluate(async (id) => {
  const r = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });  // cookie auth, no header
  return r.status;
}, workspaceId);
expect(status).toBe(200);
await expect(page.getByTestId('workspace-select')).not.toContainText(editedWorkspaceName);
```

#### Test 2 — `removing a member immediately revokes their access` (L55-128)

| # | line | test expects | code reality | verdict | fix |
|---|---|---|---|---|---|
| 1 | 61-66 | register owner | — | ✅ | — |
| 2 | **70-71** | `on('dialog')` + `new-workspace-btn` | in-app `PromptModal` (X1) | ❌ **hard fail — same as Test 1** | `prompt-input`/`prompt-submit` |
| 3 | 74-75 | id + switch | `Sidebar.tsx:50,57` | ✅ | — |
| 4 | 82-87 | register member | — | ✅ | — |
| 5 | **91** | `click('text=Members')` | the button carries `data-testid="workspace-members-tab"` (`WorkspaceSettingsModal.tsx:96`); a `text=` selector also risks matching other "Members" text | ⚠️ violates the project's testid convention | `getByTestId('workspace-members-tab')` |
| 6 | 92 | `user-autocomplete-input` | `UserAutocomplete.tsx:51` | ✅ | — |
| 6b | — | search finds the member | `GET /users/search?q=` (`UserAutocomplete.tsx:35`) → `UserRepository.search` (`:122-143`) is now a raw parameterized query with explicit `ESCAPE '\'` (`:133-136`) — the `_`-in-email bug **is fixed**. Prefix match `term%`, `LIMIT 10` | ✅ **verified fixed; critical here** | — |
| 7 | **94** | `click('[data-testid="user-autocomplete-result"]')` without `.first()` | rows are rendered per result (`UserAutocomplete.tsx:66-69`); Playwright **strict mode** throws if >1 match. In practice the query is a unique full email ⇒ exactly 1 | ⚠️ low-risk but fragile | add `.first()` |
| 8 | 95 | `workspace-invite-role` = `'editor'` | the select renders **only** `viewer` and `editor` (`WorkspaceSettingsModal.tsx:174-182`); server enum is `z.enum(['viewer','editor'])` (`workspaces.schemas.ts:15-18`) | ✅ **valid** | — |
| 9 | 96 | `workspace-invite-btn` | `:183-190`, `disabled={!inviteEmail}` — enabled after the fill | ✅ | — |
| 9b | 96 | — | the test does not wait for the member row; `handleAddMember` (`:58-67`) awaits `refreshMembers()` but the test proceeds straight to the member reload | ⚠️ race | await `member-email` filtered by the email before continuing |
| 10 | 99-101 | member reload + switch | server `GET /workspaces` lists memberships | ✅ | — |
| 11 | 104 | `toHaveValue(workspaceId)` | `Sidebar.tsx:50` | ✅ | — |
| 12 | 107-109 | `member-row` + `member-remove-btn` | `WorkspaceSettingsModal.tsx:206` and `:234` (rendered only `if (isOwner && m.role !== 'owner')`, `:231-233`); `handleRemove` (`:69-76`) calls DELETE directly | ✅ **no confirm modal — the test is right not to click `confirm-btn`** | — |
| 12c | — | the owner's modal is still open | never closed after L96; `member-row` lives in the members tab | ✅ | — |
| 13 | **112-124** | removed member gets 401/403/404 | `GET /api/workspaces/:id` is guarded by `requireWorkspaceRole('viewer')` (`workspaces.ts:66`); `rbac.ts:60-63` — `getUserWorkspaceRole` returns null for a non-member → **`403 'Access denied: not a workspace member'`**. Cookie auth carries the identity (X3) | ✅ **the check is real: 403** | drop the bogus Bearer header; tighten to `toBe(403)` |
| 13b | 123-124 | — | **V-2**: `[401,403,404]` also passes if the member was **never** granted access, if the id is wrong, or if the session expired — it cannot distinguish "revoked" from "never worked" | ⚠️ weak | add a **positive control**: assert 200 *before* removal, 403 after. The L104 check only inspects the `<select>` value, not server access |

---

## Real app/server bugs found during the spec pass

Separate from test-only fixes. These are product defects; each should be fixed
and ideally covered by a regression test.

| id | severity | bug | location |
|---|---|---|---|
| **B-6** | **high** | **Superadmin environment edits broadcast nothing.** `checkEnvPermission` early-returns at line 13 for `isSuperAdmin` **before** line 17 assigns `req.params.workspaceId`. Both `PUT /environments/:id` (`:72`) and `DELETE /environments/:id` (`:81`) then call `emitToWorkspace(undefined, …)`, which silently no-ops (X10). Every other client in the workspace keeps stale data. Contrast `routes/collections.ts:74-76`, which assigns `resolvedWorkspaceId` *before* its superadmin short-circuit — that asymmetry is the entire bug. **Fix:** resolve the item and assign `workspaceId` unconditionally, then apply the role check only for non-superadmins. | `server/src/routes/environments.ts:11-21,72,81` |
| **B-1** | **high** | **Dirty-tab edits are silently reverted (data loss).** `updateActiveRequest` computes `tabBarRelevant = !activeTab?.isDirty \|\| 'name' in updates \|\| 'method' in updates` and, when false, **does not update the tab object in `tabs`** — only `activeRequest`. Since `selectTab` restores `activeRequest` *from* `tabs`, switching away and back **discards** those edits. It is a render optimisation (comment at `:223-227`). `tabs.spec.ts` Test 2 only passes because `page.fill()` dispatches one input event per field, so each write happens while the tab is still clean. **Fix:** always update the tab; optimise re-render with a selector/`useShallow` instead (the tab bar already uses `useShallow`, `RequestTabBar.tsx:11-23`). Add a regression test that edits a dirty tab twice before switching. | `client/src/store/requestStore.ts:207-235` (esp. `:228-232`) |
| **B-3** | medium | **`SaveRequestModal` still references an undefined `folders`** when saving into a *folder*: `collectionId = folders.find(...)`, but the component destructures only `{collections, foldersByCollection}`. Throws `ReferenceError`, caught at `:100`, modal silently stays open forever. **The "SaveRequestModal crash" fix recorded below missed this call site.** Not hit by `tabs.spec.ts`, which saves to a collection. | `client/src/components/request/SaveRequestModal.tsx:54` vs `:7` |
| **B-2** | medium | **Saving an already-saved request immediately re-dirties the tab.** `UrlBar.tsx:373` calls `markSaved()` (clears `isDirty`), then `:423` calls `updateActiveRequest({updatedAt, isConflicted:false})` — and `updateActiveRequest` **unconditionally** sets `isDirty: true` (`requestStore.ts:221`). Same at `:406` in the conflict-overwrite branch. The orange dot comes straight back, and any later tab close pops the unsaved-changes confirm. **Fix:** use `updateTab` / a non-dirtying setter, or add an `isDirty` passthrough. | `UrlBar.tsx:373,406,423`; `requestStore.ts:221` |
| **B-5** | medium | **The "Globals (Common)" environment entry has no `data-testid`**, so there is no testid-based way to open the global environment at all. `socket-advanced.spec.ts` and `scripts.spec.ts` Test 3 both need it. The TopBar quick-look equivalent (`TopBar.tsx:177-181`) is likewise untestable. **Fix:** add `data-testid="env-globals-btn"` — the name the tests already assume. | `client/src/components/environment/EnvironmentSidebar.tsx:83` |
| **B-4** | low/UX | Saving via `SaveRequestModal` does not expand the target collection in the sidebar — it bypasses the store's `createRequest`, the only caller of `openCollection` (X7). The new request is invisible until the user expands manually. | `SaveRequestModal.tsx:71` vs `collectionStore.ts:467` |
| **B-7** | latent | **An already-open environment tab never picks up an incoming `environment:updated` broadcast.** `localVars` is seeded by a `useEffect` keyed only on `envId`. `socket-advanced.spec.ts` passes only because B opens the tab *after* the event. Same root cause as the `scripts.spec.ts` Test 1 note. | `EnvironmentTabEditor.tsx:26-32` |
| **B-8** | latent | The server's `updatedAt` is dropped when the just-saved request replaces the tab, permanently disabling that tab's client-side conflict pre-check (`UrlBar.tsx:394`) until the tab is reopened. Currently *beneficial* for `socket-sync.spec.ts` (it suppresses a spurious dialog for User A) — i.e. that test passes by accident. | `SaveRequestModal.tsx:79-93` |
| **B-9** | low | `pm.sendRequest` results are forwarded raw, so `res.code` is `undefined`, while the test-phase response **is** remapped to `code` (`scripts.ts:118-125`). Inconsistent API surface. **Fix:** normalize both, keeping `status` as an alias. | `client/src/utils/scripts.ts:102` vs `:118-125` |
| **B-10** | low | **Script failures are invisible.** `{type:'error'}` resolves as a fake `'Script Execution'` test row (S3) and, for pre-request scripts, that result is discarded entirely (S4). No throw, no console entry, no UI signal. This is why the `req` gap took a full triage pass to find. **Fix as part of the `req` work** (Change 2 ▸ 4). | `worker.ts:130-132`, `scripts.ts:88-90`, `UrlBar.tsx:164` |

## Vacuous assertions — tests that pass for the wrong reason

| id | where | problem |
|---|---|---|
| **V-1** | `workspace.spec.ts:39-52` | The "delete a workspace" step has **no assertion at all** and is swallowed by `try/catch`. The test name promises coverage that does not exist. |
| **V-2** | `workspace.spec.ts:123-124` | `expect([401,403,404]).toContain(status)` passes for *any* failure, including "the member never had access". Needs a 200-before positive control. |
| **V-3** | `workspace.spec.ts:41,113` | `localStorage.getItem('token')` is always `null` and the `Authorization` header is ignored by the server (X3). The calls work purely via the same-origin cookie. The code implies a Bearer scheme this app does not have. |
| **V-4** | `share.spec.ts:39-43, 84-90` | `.monaco-editor.nth(1)` never matches and is wrapped in `if (isVisible())`, so **no test script is ever set**. Three "sensitive data is stripped" assertions then verify stripping on data that was never sensitive. |
| **V-5** | `share.spec.ts:87-88` | `reqData.auth?.bearer?.length` and `reqData.auth?.token` are `undefined` **by construction** — the server whitelist emits only `{type}`. These can never fail, even if the server leaked everything through another field. |

---

## Open product decisions

| id | decision | recommendation |
|---|---|---|
| **D-1** | **`share.spec.ts` revoke.** `DELETE /api/share/:shortId` is fully implemented and creator-guarded (`share.ts:85-95`) but **nothing in the client ever calls it** — dead code. `ShareLinkModal` also doesn't list existing links, so it has no `shortId` to revoke except the one it just generated. **(a)** Build it (~15 lines): keep the `shortId` from the POST response (currently discarded — only `res.data.url` is used, `:23`) and add a `share-link-revoke-btn` in the success branch (`:82-104`) calling `api.delete('/share/'+shortId)`. **(b)** Test-only: `page.request.delete(...)` — note **`page.request`, not the anonymous context**, since the endpoint requires the owner's cookie. | **(a)** — a revoke endpoint no UI can reach is a genuine product gap, and the test was clearly written against the intended feature. |
| **D-2** | **`scripts-scope.spec.ts` `req` object.** | **RESOLVED — Option 1 (build it).** Full spec above. Cheaper than estimated: no server change, no schema change, no migration. |
| **D-3** | **`extension.spec.ts` in the `sqlite` project.** It launches a headed browser and is picked up by the unfiltered `sqlite` project, then run again by CI's `--project=extension`. | Add a `testIgnore` for `extension.spec.ts` on the non-extension projects, so Step 3's full-suite run is not blocked by a headed browser. |
| **D-4** | **The 6 untriaged spec files.** | Triage them before declaring Step 3 done — they are almost certainly part of the "+20 did not run" count. |
| **D-5** | **`res.code` vs `res.status` for `pm.sendRequest`** (B-9). | Normalize the app (keep `status` as an alias) rather than changing the test — the inconsistency is a real API wart. |

---

## Resolved gaps (for reference — already decided/fixed in earlier sessions)

- **`/api/proxy` server relay** (client-proxy.spec.ts, concurrency.spec.ts,
  edgecases.spec.ts, response.spec.ts, scripts-scope.spec.ts's own proxy mock):
  never implemented server-side; browser transport does a direct `fetch(url)`.
  Fixed in each file by mocking the actual target URL instead of `**/proxy`.
  `client-proxy.spec.ts` itself was deleted since it had no content left once the
  fake proxy premise was removed. *(Re-confirmed this pass: X11.)*
- **Global Environments** ("Globals (Common)"): client called
  `GET /workspaces/:id/environments` and filtered for `isGlobal`, which the server
  never sets (the global env lives in a separate `SqlGlobalEnvironment`
  table/repository that had no routes at all). Implemented
  `GET`/`PUT /workspaces/:id/global-environment` server routes and rewired
  `TopBar.tsx` + `EnvironmentTabEditor.tsx` to use them. *(Re-confirmed this pass:
  the PUT correctly emits `environment:updated` with `isGlobal:true`, and
  `SocketSync` handles it — but the entry still has no testid, see B-5.)*
- **Collection Runner crash on open**: `CollectionRunnerModal.tsx` read a
  non-existent `requests` field off `useCollectionStore()` (the store only has
  `requestsByFolder`). Now fetches `GET /collections/:id/requests` directly.
- **Collection Runner had no Stop button**: `collection-runner-stop-btn` didn't
  exist; the Run button just showed "Running..." and stayed disabled.
  Implemented a real stop (a ref checked between iterations) plus the button.
- **SaveRequestModal crash**: read `folders` (doesn't exist; only
  `foldersByCollection`) — crashed the modal any time a collection had any
  content. Also called a non-existent `setRequests`/`.requests` after saving
  (silently caught, left the modal stuck open forever) and dropped the original
  tab's `tabId` when converting an unsaved tab to saved (created a duplicate ghost
  tab that stayed dirty forever instead of updating in place).
  ⚠️ **INCOMPLETE — see B-3: `SaveRequestModal.tsx:54` still references the
  undefined `folders` on the save-into-a-folder path.**
- **UrlBar.tsx crashed on send whenever a request had a `folderId`**: two separate
  spots destructured `folders` from the collection store (doesn't exist) to walk
  the folder-ancestry chain for inherited pre-request scripts/auth. Same root
  cause as SaveRequestModal's crash.
- **GroupEditModal.tsx crashed on any folder edit**: same `folders`/`setFolders`
  non-existent-field bug, for editing a folder's variables/pre-request/test script.
- **Request bodies were never actually sent**: `UrlBar.tsx` read
  `activeRequest.bodyMode` (doesn't exist — the mode lives at
  `activeRequest.body.mode`), so `bodyMode` was always `undefined` and every send
  fell through to an empty body regardless of raw/form-data/urlencoded content.
- **`stripJsonComments` was never called**: imported but unused in `UrlBar.tsx`;
  JSON bodies with comments were sent verbatim instead of stripped.
- **Saving an existing (already-saved) request always failed with 400**:
  `UrlBar.tsx` PUT the entire `activeRequest` tab object
  (`tabId`/`isDirty`/`_id`/etc. included) against a `.strict()` zod schema that
  only allows request-content fields. Built a clean payload instead.
- **`requestItemSchema` rejected the client's own param/header shape**: `.strict()`
  schema didn't include `description`, which `KeyValueEditor.tsx` always sends —
  every save of a request with any params/headers failed 400.
- **Workspace settings could never be saved**: `updateWorkspaceSchema` didn't
  include `isPublic`, which the settings form always sends — every "Save Changes"
  click 400'd. Added the field to the schema and the route's patch allowlist.
  *(Re-confirmed present and correct this pass: `workspaces.schemas.ts:9-13`,
  `workspaces.ts:92-98`.)*
- **User search silently returned nothing for any query containing `_`**:
  `escapeLike` escapes `_`/`%` assuming the caller adds `ESCAPE '\'` to the SQL —
  the plain `Op.like` query never did, and SQLite (unlike postgres/mysql) has no
  implicit default LIKE escape char, so the escaped backslash was read as a
  literal character. Rewrote `UserRepository.search` as a raw parameterized query
  with an explicit `ESCAPE '\'`. *(Re-confirmed present this pass:
  `UserRepository.ts:122-136`. Critical — every email in the remaining specs
  contains `_`.)*
- **Export Data downloaded nothing**: `GET /admin/export/:workspaceId` returned
  plain JSON with no `Content-Disposition`, so `window.location.href`-triggered
  "download" just navigated the SPA to a JSON page instead of downloading a file.
- **Route ordering bug**: `/reorder` was registered as a bare path (so it never
  actually matched the client's `/collections/reorder` calls — Express routed those
  into `/collections/:id` instead, treating "reorder" as an id). Also, once
  reachable, the handler's `bulkCreate(..., {updateOnDuplicate})` still failed on
  SQLite due to NOT NULL columns not present in the partial upsert row. Moved the
  route earlier and switched to per-row `UPDATE`s. *(Re-confirmed this pass: the
  route is `PUT /api/collections/reorder` and it **does** emit
  `workspace:reordered` — `socket-events.spec.ts` just calls a URL that never
  existed, see A2.)*
- **Confirm-on-save-conflict dialog never rendered**: `ConfirmModal` was imported
  and its state (`confirmConfig`) was set on conflict, but the component was never
  actually mounted in `UrlBar.tsx`'s JSX — clicking Save during a conflict silently
  did nothing visible.
- Assorted test-file-only issues fixed throughout (for pattern reference when
  resuming): native `window.prompt`/`confirm` dialogs used where the app actually
  shows a custom in-app modal (`prompt-input`/`prompt-submit`, `confirm-btn`);
  missing per-test login since each Playwright test gets a fresh browser context;
  workspace selection by label instead of id (breaks under serial-mode retries,
  which restart the whole `describe.serial` block and can produce duplicate-named
  workspaces); collections/folders render collapsed on every fresh page load and
  don't auto-expand for children added outside the sidebar's own "New
  Folder"/"New Request" menu (e.g. via `SaveRequestModal` or the History "Save to
  Collection" action); the `tab-*` testid prefix collides between the sidebar's
  Envs/History panel buttons and actual request tabs (disambiguate with
  `:not([role="tab"])`); Monaco's EditContext-based input needs a paste (clipboard
  write + Ctrl+V), not literal keystroke typing, when the content has
  brackets/quotes/parens, or auto-closing pairs mangle it; a 500ms debounce
  coalesces rapid edits for undo/redo, so tests asserting undo need to wait past
  that window.

> **Every one of those patterns recurs in the 8 remaining files.** They are
> captured as X1–X12 above so the fixes can be applied mechanically rather than
> rediscovered per file.

---

## Carried over from plantest.md — not yet executed

`plantest.md`'s original plan had 5 steps (0–4). Steps 0–2 are the file-by-file
diagnose/fix loop (see "Done" above); they're well underway but not finished (8
files specced but not yet fixed, plus 6 never triaged). **Steps 3 and 4 below
have not been started at all** — nothing has run the full suite yet, only
individual spec files in isolation.

### Step 3 (plantest.md) — full suite run + repeat — NOT DONE

Once every individual file above is fixed and stable on its own, run the **whole
suite together**, not just each file alone:

```
npm run test:e2e -- --project=sqlite
```

Do this **2–3 times in a row** (matching how the jest/server-side e2e
stabilization was verified earlier in this project), because:

- Fixes landed in shared code (`collectionStore.ts`, `UrlBar.tsx`,
  `requestItemSchema`, `updateWorkspaceSchema`, and now `worker.ts` /
  `scripts.ts` / `requestStore.ts`) were each verified only against the one or
  two files that surfaced them — they need re-verification against the full
  accumulated-state run.
- The files fixed individually so far were **never run together** in one
  invocation — cross-file shared-server-state issues (the original root cause
  described in plantest.md: one global admin/server for the whole run,
  accumulating workspaces across every spec file) could still surface
  combinations that don't show up when a file runs alone. **`socket-events.spec.ts`
  is the canary here:** it picks `wsList[0]` with no ORDER BY, so it is the one
  file whose correctness genuinely depends on nothing else having polluted the
  admin's workspace list.
- plantest.md's own instruction: repeat 2–3 times specifically to catch new
  flakiness, not just confirm a single pass.

**Before starting Step 3, settle D-3** (`extension.spec.ts` launches a headed
browser and is currently in scope for `--project=sqlite`).

If new failures appear only in the full-suite run (not in the file alone),
diagnose them the same way: rerun that one file in isolation first (Step 0
methodology) to tell apart "real bug" from "this only breaks when the DB is full
of leftover state from earlier files."

### plantest.md's "+20 did not run" note — PARTIALLY EXPLAINED

The original plantest.md failure list ended with: *"(+ '20 did not run' — likely
cut off long ago by a retry/time budget; re-check once the list above shrinks)."*

**This pass found a strong candidate explanation:** the Done + Remaining lists
cover only 21 of the 27 spec files, and the 6 unaccounted files hold 10 tests
that have never been triaged (see "Coverage accounting" above). Combined with
`extension.spec.ts` being able to stall a headed browser mid-run, and
`playwright.config.ts`'s stale "36 tests" comment, the "20 did not run" is most
plausibly *"the run aborted partway and the remaining files were never
reached."* Still to do: confirm against Step 3's actual pass/fail/did-not-run
counts.

### Step 4 (plantest.md) — optional, deeper Playwright isolation — NOT DONE, still optional

plantest.md flagged this as a *possible* follow-up, explicitly **only worth
deciding on after Steps 0–3 show how much the shared-global-admin problem
actually still hurts**: give Playwright real per-spec isolation (each spec creates
its own admin/user instead of relying on one global admin shared by
`fullyParallel: false` + `workers: 1` across the whole run), mirroring what was
already done for the jest server-side e2e suite. This is an architecture change,
not a bug fix — do not start it before Step 3's full-suite results are in, and
re-confirm with the user first regardless, since it changes how every spec file
bootstraps its session.

---

## How to resume

1. Re-read this file plus `plantest.md` (background/rationale only — everything
   actionable from it is now also captured above).
2. **App-code work first**, since several test files are blocked on it:
   - the `req` object (§2 feature spec) — unblocks `scripts-scope.spec.ts`;
   - **B-10** error surfacing, which should land *with* the `req` work, or every
     future script bug stays invisible;
   - **B-6** (superadmin environment emit) — unblocks 2 of the 6 missing socket
     events;
   - **B-5** (`env-globals-btn` testid) — unblocks `socket-advanced.spec.ts` and
     `scripts.spec.ts` Test 3;
   - **D-1** revoke UI — unblocks `share.spec.ts`;
   - **B-1 / B-2 / B-3** — real defects surfaced by, but not strictly blocking,
     `tabs.spec.ts`.
3. Then work the 8 files using the per-file change lists above, in the order they
   appear (scripts → scripts-scope → share → socket-events → socket-advanced →
   socket-sync → tabs → workspace), keeping the established protocol: rebuild
   server/client as needed, then
   `npx playwright test tests/e2e/<file> --project=sqlite` against a fresh sqlite
   DB per attempt, **3 clean consecutive runs** before moving on.
4. Triage the **6 untriaged files** (D-4).
5. Settle **D-3**, then run **Step 3** (full suite, 2–3×).
6. Re-check the "+20 did not run" note against Step 3's actual output.
7. Only after 3–6 are done and reviewed with the user: decide whether Step 4
   (optional isolation architecture) is worth doing.
