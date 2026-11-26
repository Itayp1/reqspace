# Spec: Postman `pm.request` / `pm.response` API parity

## Goal
Scripts copied from Postman must run unchanged. Today `pm.request` is a plain object (`url`, `method`, `headers` map)
and `pm.response` has only `json/text/headers.get/to.have.status|header/to.be.ok`, so `pm.request.addHeader(...)`
and most `pm.response.to.*` throw.

Source of truth: Postman docs (`pm-request`, `pm-response`) and the postman-collection SDK
(Request, Url, HeaderList, RequestBody, Response). Out of scope: gRPC/GraphQL/MCP shapes, `pm.cookies`, `pm.info`, `pm.iterationData`.

## Where
- `client/src/sandbox/worker.ts` builds `pm` (the only place that needs the API objects).
- `client/src/utils/scripts.ts` (`executeInSandbox`, `diffRequestMods`) applies the result to the real request.
- `client/src/components/request/UrlBar.tsx` and `collection/CollectionRunnerModal.tsx` call the pre/test scripts.

## Rules
1. **Pre-request:** `pm.request` is mutable. Changes to url / method / headers / body.raw are applied to the sent request (existing `requestMods` flow; `diffRequestMods` must see headers added with the new methods, removals included).
2. **Post-response (test):** `pm.request` is the request that was **sent** (final url, method, headers, body), read only in effect (mutations are ignored). Today the test script gets no request, so the callers must pass it.
3. `pm.response` exists only in post-response. In pre-request it stays `undefined`.
4. **Back-compat:** what works today must keep working: `pm.request.url += '?a=1'`, `pm.request.url = 'x'`, `pm.request.method = 'POST'`,
   `pm.request.headers['X-A'] = 'b'`, `pm.response.code/status/headers/body/responseTime`, `req.headers.set/remove`.
   Existing tests (`client/src/sandbox/worker.test.ts`, `tests/e2e/scripts*.spec.ts`, `reproductions/qa42*`, `qa43*`) must stay green.
5. Header names are case-insensitive for get/has/remove/upsert; the original casing of the first write is kept.
6. Unknown/unsupported members must not silently return wrong values: either implement or throw `Error('pm.<path> is not supported')`.
7. Keep the sandbox safe: no new globals, no DOM, nothing the worker cannot structured-clone.

## `pm.request`
| Member | Behavior |
|---|---|
| `method` (get/set), `id`, `name` | string |
| `url` | Url object (see below). `String(pm.request.url)`, `url + '?x'` and assigning a string all keep working (`toString`/setter). |
| `headers` | HeaderList (see below) |
| `body` | RequestBody: `mode`, `raw`, `urlencoded`, `formdata`, `graphql`, `options`, `disabled`; `isEmpty()`, `toString()`, `toJSON()`, `update(o)`. Postman says body is immutable; here `raw` edits are applied in pre-request (superset, documented) |
| `auth` | read: `type` + parameters, `parameters()`; write via `authorizeUsing(type, opts)` is **not** applied to the sent request in v1 (accepted, no effect, documented) |
| `addHeader(h)` | h = `{key,value}` or `"Key: value"`; adds (duplicates allowed) |
| `upsertHeader(h)` | update value if the key exists, else add |
| `removeHeader(name \| Header, {ignoreCase})` | remove by name (default case-insensitive) |
| `forEachHeader(cb)` | `cb(header)` for each |
| `getHeaders({ignoreCase, enabled, multiValue, sanitizeKeys})` | plain object |
| `addQueryParams(params)`, `removeQueryParams(params)` | `string \| [{key,value}] \| object` / `string \| [string]`; delegate to `url` |
| `update(def)` | `{url, method, header, body}` |
| `clone()` | independent copy |
| `size()` | `{header, body, total, source}` computed from the request |
| `toJSON()` | `{method, url, header:[{key,value}], body}` |
| `describe(content, type)`, `disabled` | store only |
| `proxy`, `certificate`, `parent()`, `findInParents`, `forEachParent`, `meta` | not supported (throw per rule 6), except `parent()` returning `undefined` |

### `pm.request.url` (Url)
Properties: `protocol`, `host` (string[]), `path` (string[]), `port`, `hash`, `query` (list of `{key,value}` with HeaderList-style `get/has/add/remove/upsert/count/each/toObject`), `variables` (list), `auth` (`{user,password}`).
Methods: `getHost()`, `getPath(unresolved?)`, `getPathWithQuery()`, `getQueryString()`, `getRemote(forcePort?)`, `getRaw()`, `addQueryParams(p)`, `removeQueryParams(p)`, `update(urlOrObj)`, `toString(forceProtocol?)`, `toJSON()`; static `Url.parse(str)`, `Url.isUrl(o)` only if reachable from scripts (optional).
`{{vars}}` in the url stay literal (resolved by the host after the script, as today).

### HeaderList (`pm.request.headers`, `pm.response.headers`)
`add`, `upsert`, `remove(name | predicate | header)`, `get(name)` (value), `has(name[,value])`, `one(name)`, `all()`, `idx(i)`, `indexOf`, `count()`, `each(fn)`, `map`, `filter`, `find`, `reduce`, `clear()`, `append`, `prepend`, `insert`, `insertAfter`, `populate`, `repopulate`, `assimilate`, `toObject(excludeDisabled, caseSensitive, multiValue, sanitizeKeys)`, `toString()`, `contentSize()`.
Items are Header objects `{key, value, disabled}` with `toString()` (`"Key: value"`), `toJSON()`, `update(v)`, `valueOf()` (= value).
`pm.response.headers` is the same list but read only (mutators throw `pm.response.headers is read only`).

## `pm.response`
| Member | Behavior |
|---|---|
| `code` (number), `status` (text), `reason()` | `reason()` = status text |
| `headers` | HeaderList (read only) |
| `cookies` | list from `Set-Cookie` headers: `get(name)` (value), `has`, `one`, `count`, `each`, `toObject`; items `{name,value,path,domain,expires,httpOnly,secure}` |
| `responseTime` (ms), `responseSize` (bytes) | numbers |
| `text()`, `json(reviver?)`, `jsonp(cb?)` | `json` throws on invalid body (as Postman) |
| `size()` | `{header, body, total}` |
| `contentInfo()` | `{mimeType, mimeFormat, charset, fileExtension, fileName, contentType}` |
| `dataURI()` | `data:<content-type>;base64,<body>` |
| `stream`, `originalRequest` | `originalRequest` = the sent `pm.request`; `stream` = body bytes (Uint8Array) |
| `toJSON()` | `{code,status,header:[...],body,responseTime,cookie:[...]}` |

### `pm.response.to.*` (all also under `.not`, so `pm.response.to.not.have.status(404)`, `pm.response.to.not.be.error`)
- `to.have.status(codeOrText)`, `to.have.statusCode(code)`, `to.have.statusReason(text)`
- `to.have.header(name[, value])`, `to.have.body(stringOrRegExp)` (no arg = has a body), `to.have.jsonBody([path[, value]])` (path = lodash path, no arg = body is JSON; with value = deep equal)
- `to.have.jsonSchema(schema[, ajvOptions])` (needs a JSON-schema validator: add `ajv` only if absent; justify the size in the PR)
- `to.have.responseTime` chain: `.below(n)`, `.above(n)`, `.within`-style as Postman; plus `.not.above(n)`
- `to.be.ok` (200), `success` (2xx), `info` (1xx), `redirection` (3xx), `clientError` (4xx), `serverError` (5xx), `error` (4xx or 5xx), `accepted` (202), `badRequest` (400), `unauthorized` (401), `forbidden` (403), `notFound` (404), `rateLimited` (429), `withBody`, `json`
- Verify the exact list/semantics against the postman-sandbox repo (`lib/sandbox/...` response assertions) and use its list if it differs; record differences in this file.
- Properties (`ok`, `error`, ...) are getters, not calls, like Postman. A failed assertion throws a chai `AssertionError` whose message names the check, so `pm.test` shows it.

## Test helpers touched on the way
`pm.test.skip(name, fn)` records a skipped result (not a failure; show as skipped or omit), `pm.test.index()` returns number of tests so far, `pm.test` returns `pm` (chainable). `pm.expect` unchanged.

## Acceptance tests (one script, one spec)
The user's constraint: no 200 test files. The whole API is verified by **one script file** run in both phases and **one Playwright spec**.

1. `tests/e2e/fixtures/pm-api-all.js`: a single script written with `pm.test(...)`, one test per member in the tables above (name = member path, e.g. `request.addHeader`, `response.to.be.notFound`). Phase detection with `typeof pm.response === 'undefined'`:
   - **pre-request phase:** every `pm.request.*` member, including mutators. At the end it does `pm.request.addHeader({key:'X-Pre-Done', value:'1'})` so the spec can see on the wire that the script ran to the end and that mutators are applied.
   - **post-response phase:** every `pm.request.*` read member against the sent request, plus every `pm.response.*` member and assertion (mock response must carry: status 200, JSON body, `content-type`, a `Set-Cookie`, a custom header).
2. `tests/e2e/pm-api.spec.ts` (single spec, uses `mockServer`/`scene` from `reproductions/scene.ts`; extend the mock only as needed):
   - set the file content as `preRequestScript` and `testScript`, send, open the Test results tab;
   - assert **no** result has status FAIL and that the number of PASS equals the number of tests in the script (the script exports the count it expects, or the spec counts `pm.test(` occurrences);
   - assert the mock saw the headers/url/method/body the pre-request script produced (`X-Pre-Done`, added/updated/removed headers, added query param);
   - one negative control: a tiny extra script where a wrong assertion (`pm.response.to.have.status(404)`) must show FAIL, to prove the harness can fail.
3. Existing suites listed in rule 4 stay green; `tsc` (client) clean.

## Process
1. Developer: write the spec file first (it must fail), implement, run the single spec + the touched existing specs, then the full suite (shared sandbox code = bigger-than-minor change).
2. Developer hands back: changed files, test output, any deviation from this document (edit this file for deviations).
3. QA: run the single spec and the full suite, add exploratory checks of Postman snippets from the Postman "test examples" page, report every failing member in the format `member | expected | actual`.

## Implementation notes and deviations (developer)
- Code: `client/src/sandbox/pmApi.ts` (Url/HeaderList/Body/Auth/Request/Response + chai assertions), wired in `worker.ts`; `ajv` added to `client/package.json` for `jsonSchema` (~120 KB in the worker chunk only).
- Assertion list checked against `chai-postman` 2.0.1 (the plugin postman-sandbox uses). Real list: `info success redirection clientError serverError error ok accepted withoutContent badRequest unauthorised unauthorized forbidden notFound notAcceptable rateLimited withBody json`; `have.status statusCode statusReason statusCodeClass header body jsonBody jsonSchema responseTime responseSize`. Differences from this spec: added `withoutContent`, `unauthorised`, `notAcceptable`, `statusCodeClass`, `responseSize`; `responseTime` is a chainable property (`.below/.above/.within`), not a call.
- Status shortcuts (`ok`, `notFound`, ...) compare the status code only. chai-postman also compares the reason text, which makes `notAcceptable` (expects "Acceptable") and `unauthorised` never match a real response, and fails on HTTP/2 (empty reason).
- `to.not.have.jsonBody(path, value)` follows chai-postman (the existence check is negated too), so it fails when the path exists.
- `pm.test.skip` counts in `pm.test.index()` but is not listed in the results (omitted).
- `Url.parse` / `Url.isUrl` are not exposed. `Url.toString` does not encode query values; an empty trailing `?` or `#` is dropped.
- `pm.request.body` urlencoded/formdata/graphql come from the saved request (unresolved `{{vars}}`); in the test phase `raw` is the final sent body string. Body mutations apply only to raw bodies.
- Runner: pre-request scripts now get `pm.request` (saved request) but their changes are not applied to the sent request (the runner never applied them); test scripts get the sent request.
- `pm.response.headers` is a read-only HeaderList: repeated headers (Set-Cookie arrays) are separate entries, `get` returns the last one, `Object.keys(pm.response.headers)` no longer lists the header names (use `toObject()`).
- E2E uses a `window.electron.sendRequest` stub (not `mockServer`) because browser fetch() hides `Set-Cookie`; status shortcuts for non-200 codes are covered by a vitest case in `client/src/sandbox/worker.test.ts`.
