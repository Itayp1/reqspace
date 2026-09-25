# SEC implementation spec — SEC-1, SEC-6, SEC-7, SEC-10, SEC-11

Execution-level spec for a coding agent. Every claim here was **verified against the working tree at
commit `ff0d60f`** — not copied from `TODO.md`. Where `TODO.md` is stale or wrong, this document says so
and wins. Line numbers are from `ff0d60f`; re-grep before editing if the tree has moved.

Out of scope (explicit user decisions): **SEC-0** (delete server proxy / Chrome extension), **SEC-3**
(script sandbox), **SEC-12** (remove NTLM). **SEC-4** is done (`ff0d60f`). **SEC-5** needed no work —
`GET /api/admin/export/:workspaceId` (`server/src/routes/admin.ts:63`) already builds
`{ workspace, collections, folders, requests, environments }` with no `config` key, so there is no secret
to leak. `TODO.md`'s SEC-5 is stale; do not "fix" it.

Recommended order: **SEC-1 → SEC-7 → SEC-6 → SEC-11 → SEC-10**. SEC-10 last because it is the only one
that can break the UI, and it has a hard prerequisite (see SEC-10.0).

General rules for all five:
- Server tsconfig has **no** `noUnusedLocals`; client `tsconfig.app.json` has `noUnusedLocals: true` **and**
  `noUnusedParameters: true`. An unused import in client code fails `npm run build`.
- `deploy.js` runs `npm run build` for `client/` then `server/` and PM2 restarts on any non-zero exit with
  no `max_restarts` configured — **a build error becomes an instant crash loop in production.** Always run
  both builds before committing.
- Jest: `server/package.json` `"jest"` block, preset `ts-jest`, `testMatch: **/tests/**/*.test.ts`, roots
  `server/src`. Run with `npm test --prefix server` (it is `jest --runInBand`).
- `supertest@^7` is already a server devDependency, but `server/src/index.ts` **does not export `app`**
  (only `io`). Any supertest-based test needs `export { app };` added to `index.ts` first — that is a safe,
  behavior-free change, but note `bootstrap()` runs on import, so prefer pure unit tests where possible.
- `server/src/tests/ssrf.test.ts` is the style model for pure unit tests (table-driven, offline,
  deterministic). Follow it.

---

## SEC-1 — Rotate and remove the committed JWT secret

**Status: real, unfixed. This is the highest-severity item in this document — treat it as an incident, not
a code change.**

### Verified current state

`k8s/secret.yaml` (committed, full contents):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: reqspace-web-secret
type: Opaque
data:
  JWT_SECRET: Y2hhbmdlX21lX2luX3Byb2R1Y3Rpb24=
```

`echo Y2hhbmdlX21lX2luX3Byb2R1Y3Rpb24= | base64 -d` → `change_me_in_production`.

`server/src/utils/jwtSecret.ts:9-12`:

```ts
const KNOWN_INSECURE_VALUES = new Set([
  'changeme',
  'change_me_in_production_very_long_secret_key',
]);
```

`change_me_in_production` is **not** in that set, and `resolveJwtSecret()` (`:28-31`) accepts any
`process.env.JWT_SECRET` not in the set with no length check:

```ts
const fromEnv = process.env.JWT_SECRET;
if (fromEnv && !KNOWN_INSECURE_VALUES.has(fromEnv)) {
  cached = fromEnv;
  return cached;
}
```

So a cluster that applied `k8s/secret.yaml` signs every session token with a value published in this
repository. Anyone can mint a token for any `sub`, including a superadmin. `signToken` is in
`server/src/middleware/auth.ts`.

### Changes

**1. `server/src/utils/jwtSecret.ts`** — add the leaked value and a production length floor:

```ts
const KNOWN_INSECURE_VALUES = new Set([
  'changeme',
  'change_me_in_production',                       // was committed in k8s/secret.yaml — permanently burned
  'change_me_in_production_very_long_secret_key',
  'secret',
  'jwt_secret',
  'your-secret-key',
  'changeme123',
]);

const MIN_SECRET_LENGTH = 32;
```

Then replace `:27-31` with:

```ts
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) {
    if (KNOWN_INSECURE_VALUES.has(fromEnv)) {
      throw new Error(
        'JWT_SECRET is a known placeholder/leaked value and cannot be used. ' +
        'Generate a real one: openssl rand -hex 32',
      );
    }
    if (process.env.NODE_ENV === 'production' && fromEnv.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production.`);
    }
    cached = fromEnv;
    return cached;
  }
```

Behaviour change to be deliberate about: previously an insecure `JWT_SECRET` **silently fell through** to
the auto-generated local-file path. Now it **throws**. That is the point (a misconfigured production must
not boot), but it means a dev with `JWT_SECRET=changeme` in `.env` now gets a hard startup failure with a
clear message instead of a warning. Keep the throw — do not soften it to a `console.warn`.

Leave the rest of the function (production refusal when unset, `ALLOW_EPHEMERAL_JWT_SECRET`, the
`.jwt-secret.local` generate-and-persist path) exactly as is.

**2. `k8s/secret.yaml`** — remove the value so a misconfigured cluster fails instead of silently working:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: reqspace-web-secret
type: Opaque
# JWT_SECRET is intentionally NOT committed — the value that used to live here
# (base64 of "change_me_in_production") is public in this repo's git history and is
# now rejected at startup by server/src/utils/jwtSecret.ts.
# Supply it from a SealedSecret or an external secrets manager:
#   kubectl create secret generic reqspace-web-secret \
#     --from-literal=JWT_SECRET="$(openssl rand -hex 32)"
# The pod must fail to start if it is missing.
```

Check whether anything else in `k8s/` references this Secret's key and still expects it to exist
(`grep -rn "reqspace-web-secret" k8s/`) — a Deployment with `secretKeyRef` and no `optional: true` will
leave the pod in `CreateContainerConfigError`, which is the desired fail-closed behaviour, but the person
deploying needs to know that is expected.

**3. Operational steps — these are not code and must be handed to the operator, not automated.**
The spec should surface them; do not attempt them from an agent:
- Generate and install a fresh `JWT_SECRET` in every environment that ever applied this manifest.
- Treat every existing session as forged-capable: after rotation all old tokens fail verification
  automatically (they were signed with the old key), which is the desired invalidation. No extra
  revocation list is needed.
- The value is in git history. History rewriting is not required for safety once the key is rotated and
  rejected in code, and is destructive for anyone with a clone — **do not rewrite history**; rotation plus
  the blocklist is the correct remediation.

### Tests

New file `server/src/tests/jwtSecret.test.ts`. `resolveJwtSecret()` memoizes into a module-level `cached`,
so each case must reset the module registry:

```ts
describe('resolveJwtSecret', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => { process.env = ORIGINAL_ENV; });

  function load() {
    return require('../utils/jwtSecret').resolveJwtSecret as () => string;
  }

  it('rejects the value committed in k8s/secret.yaml', () => {
    process.env.JWT_SECRET = 'change_me_in_production';
    expect(() => load()()).toThrow(/placeholder|leaked/i);
  });

  it('rejects a short secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(20);
    expect(() => load()()).toThrow(/at least 32/i);
  });

  it('accepts a 64-char secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(64);
    expect(load()()).toHaveLength(64);
  });

  it('allows a short secret outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'short_but_fine_in_dev';
    expect(load()()).toBe('short_but_fine_in_dev');
  });
});
```

Note `jwtSecret.ts` imports `'dotenv/config'` at the top, which loads `server/.env`. If `server/.env`
defines `JWT_SECRET`, `process.env.JWT_SECRET` is already populated before the test sets it — setting it
explicitly in each case (as above) is what makes the test deterministic. Do **not** delete
`process.env.JWT_SECRET` and assert the generate-a-file path in CI; it writes `server/.jwt-secret.local`.

**Done when:** the four cases above pass, `grep -rn "change_me_in_production" k8s/` returns nothing, and
`npm run build --prefix server` is clean.

---

## SEC-6 — Escape user input that reaches a query pattern

**Status: `TODO.md` is substantially stale. The ReDoS vulnerability it describes no longer exists.**

### Verified current state

`grep -rn "new RegExp" server/src` returns **zero matches**. The Mongo removal
(`36b3331 chore: Remove MongoDB and Capture Traffic leftovers entirely`) deleted every `$regex` / `new
RegExp` search path, including the `admin.ts:26-27` and `:174` sites `TODO.md` names — `admin.ts:27-35` is
now `maskConfigSecrets`, and `admin.ts` has **no** search route at all. There is no ReDoS vector left and
no CPU-pinning test to write.

What actually remains is **unescaped `LIKE` wildcards and no input length cap** in two places:

`server/src/repositories/RequestRepository.ts:101-113`:

```ts
  async searchInWorkspace(query: string, collectionIds: string[]): Promise<IRequestRecord[]> {
    const { Op } = await import('sequelize');
    return (await SqlRequest.findAll({
      where: {
        collectionId: { [Op.in]: collectionIds },
        [Op.or]: [{ name: { [Op.like]: `%${query}%` } }, { url: { [Op.like]: `%${query}%` } }],
      }
    })).map(sqlToRecord);
  },
```

`server/src/repositories/UserRepository.ts:102-119`:

```ts
  async search(query: string): Promise<Pick<IUserRecord, '_id' | 'name' | 'email' | 'avatar'>[]> {
    const { Op } = require('sequelize');
    const users = await SqlUser.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `${query}%` } },
          { email: { [Op.like]: `${query}%` } }
        ]
      },
      limit: 10,
      attributes: ['id', 'name', 'email', 'avatar']
    });
```

Reachability, verified:
- `UserRepository.search` ← `GET /api/users/search` (`server/src/routes/users.ts:8-15`), `authenticate`d,
  reachable by any logged-in user. Has a `q.length < 2` guard and no upper bound. **Live.**
- `RequestRepository.searchInWorkspace` ← **no route anywhere.** Only `server/src/tests/db.repositories.test.ts:293,298`
  call it. Global search in the client (`client/src/components/common/GlobalSearchModal.tsx`) filters the
  already-loaded `collectionStore` in memory and makes no API call. So this is **dead code** today.

Severity is therefore low: no ReDoS, no injection (Sequelize parameterizes the value; `%`/`_` change
*matching*, not SQL structure). The real issues are (a) `q = "%"` returns every row the user can see,
(b) an unbounded `q` makes a large `LIKE` scan, (c) `escapeRegex` is imported but never called.

### Changes

**1. New util `server/src/utils/escapeLike.ts`:**

```ts
/**
 * Escapes the LIKE wildcards in a user-supplied search term. Sequelize
 * parameterizes the value, so this is not an injection fix — it stops `%` and
 * `_` from silently widening the match (a search for `%` otherwise returns
 * every row) and keeps the pattern anchored to what the user actually typed.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Hard cap on how long a search term may be before it hits the database. */
export const MAX_SEARCH_LENGTH = 100;
```

Escape character note: `\` is MySQL's and SQLite's default LIKE escape, and Postgres's too, so
`ESCAPE '\'` does not need to be stated explicitly for these three. `mssql` uses `[]` bracket escaping and
no default escape character — if the mssql backend matters, the term must be escaped as
`value.replace(/[\[\]%_]/g, (c) => '[' + c + ']')` instead. `DB_TYPE` supports `mssql`
(`server/src/db/dbConfig.ts`), so **pick one**: either dialect-switch inside `escapeLike` using
`getSequelize().getDialect()`, or document that LIKE escaping is only correct on
postgres/mysql/sqlite. Recommended: dialect-switch, it is six lines.

**2. `server/src/routes/users.ts`** — cap and clean at the boundary, and drop the dead import:

```ts
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRepository } from '../repositories/UserRepository';
import { MAX_SEARCH_LENGTH } from '../utils/escapeLike';

const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  const raw = req.query.q;
  const q = (typeof raw === 'string' ? raw : '').trim().slice(0, MAX_SEARCH_LENGTH);
  if (q.length < 2) {
    return res.json([]);
  }
  const users = await UserRepository.search(q);
  res.json(users);
});
```

The `typeof raw === 'string'` check matters: `?q[]=a&q[]=b` makes `req.query.q` an **array**, and the
current `req.query.q as string` then reaches `.length` on an array and `${query}` stringifies it into the
pattern. Removing `import { escapeRegex }` is required — it is unused after this and is currently only
not a build error because the server tsconfig lacks `noUnusedLocals`.

**3. `server/src/repositories/UserRepository.ts`** — escape inside the repository (defence in depth, so a
second caller cannot skip it):

```ts
  async search(query: string): Promise<Pick<IUserRecord, '_id' | 'name' | 'email' | 'avatar'>[]> {
    const { Op } = require('sequelize');
    const term = escapeLike(String(query).slice(0, MAX_SEARCH_LENGTH));
    const users = await SqlUser.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `${term}%` } },
          { email: { [Op.like]: `${term}%` } }
        ]
      },
      limit: 10,
      attributes: ['id', 'name', 'email', 'avatar']
    });
```

with `import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';` at the top.

**4. `server/src/repositories/RequestRepository.ts`** — same treatment, plus a `limit`. It is dead code,
but it is exported, tested, and the obvious thing a future route will call; leaving it as the one
unescaped path invites the bug back:

```ts
  async searchInWorkspace(query: string, collectionIds: string[]): Promise<IRequestRecord[]> {
    const { Op } = await import('sequelize');
    const term = escapeLike(String(query).slice(0, MAX_SEARCH_LENGTH));
    if (!term) return [];
    return (await SqlRequest.findAll({
      where: {
        collectionId: { [Op.in]: collectionIds },
        [Op.or]: [{ name: { [Op.like]: `%${term}%` } }, { url: { [Op.like]: `%${term}%` } }],
      },
      limit: 200,
    })).map(sqlToRecord);
  },
```

`limit: 200` is a new behaviour cap. `db.repositories.test.ts:293` asserts a match is found and `:298`
asserts a non-match returns empty — both still pass. Confirm by running `npm test --prefix server -- --testPathPattern=db.repositories`.

**5. Decide explicitly (and record the decision in `TODO.md`): delete `searchInWorkspace` instead.**
If global search is intentionally client-side forever, deleting the method plus its two tests is the
smaller, honest change. Do not do both — pick one and say which.

### Tests

New file `server/src/tests/escapeLike.test.ts` — pure unit, `ssrf.test.ts` style:

```ts
import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';

describe('escapeLike', () => {
  const cases: Array<[string, string, string]> = [
    ['percent', '%', '\\%'],
    ['underscore', 'a_b', 'a\\_b'],
    ['backslash', 'a\\b', 'a\\\\b'],
    ['wildcard soup', '%_%', '\\%\\_\\%'],
    ['plain text untouched', 'users', 'users'],
    ['spaces untouched', 'get users', 'get users'],
  ];
  it.each(cases)('escapes %s', (_name, input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });

  it('caps at a sane length', () => {
    expect(MAX_SEARCH_LENGTH).toBeLessThanOrEqual(100);
  });
});
```

Plus, in `server/src/tests/db.repositories.test.ts`, a case asserting `searchInWorkspace('%', [colId])`
returns `[]` or only genuine `%`-containing names — **not** every request in the collection. (If step 5
deletes the method, skip this.)

**Done when:** `GET /api/users/search?q=%25` returns only users whose name/email literally starts with
`%` (i.e. normally `[]`), `?q[]=a&q[]=b` returns `[]` instead of throwing, `grep -rn "escapeRegex" server/src`
returns only `utils/escapeRegex.ts` itself (or nothing, if you delete the now-unused util), and
`npm test --prefix server` is green.

---

## SEC-7 — Stop leaking `dbError` to anonymous callers

**Status: real, unfixed. Small, but has a client-side consequence that is easy to miss and will silently
break the DB-down screen if you only change the server.**

### Verified current state

`server/src/index.ts:127-141` — `/api/health` **does** mask in production:

```ts
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    status: dbStatus,
    dbType,
    dbError: dbError ? (isProd ? 'Database unavailable' : dbError) : undefined,
    ...
```

`server/src/index.ts:144-157` — the gate immediately below does **not**:

```ts
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (dbStatus !== 'ok') {
    return res.status(503).json({
      message: 'Database not available',
      dbError: dbError || 'Database is not connected',
      dbType,
      dbStatus,
    });
  }
  next();
});
```

`dbError` is set at `index.ts:260` from `err?.message` of the failed `connectDb`. Sequelize/driver messages
routinely contain host, port, database name and user — during this project's own debugging it produced
`Access denied for user 'sql7837542'@'46.210.27.183' (using password: YES)`. This is returned on **every**
`/api/*` path to **unauthenticated** callers whenever the DB is down.

Client consumers, verified in `client/src/App.tsx`:
- `:143-150` — reads `GET /health` and, on `status === 'error'`, stores `health.dbError` (already masked in
  prod → `"Database unavailable"`).
- `:174-181` — the catch path: `if (err.response?.status === 503 && err.response?.data?.dbError)` then
  stores `err.response.data.dbError` (the **unmasked** gate string).
- `:211-213` → `DbErrorScreen`, which renders `dbError` verbatim at `:63` full-screen.

**The trap:** if the gate stops sending `dbError` in production, the `&& err.response?.data?.dbError`
condition at `:176` becomes false, `setDbError` is never called, and the app falls through to the login
page against a dead API with no explanation. The client change is **not optional**.

### Changes

**1. `server/src/index.ts:144-157`:**

```ts
app.use('/api', (req, res, next) => {
  // Always allow the health check even if the DB is down. (The previous
  // '/admin/db-config' carve-out referenced a route that doesn't exist — CR#18.)
  if (req.path === '/health') return next();
  if (dbStatus !== 'ok') {
    // The raw driver message can carry host, database name and user (CR#24) and
    // this gate answers unauthenticated callers on every path — mirror
    // /api/health and mask it in production.
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(503).json({
      message: 'Database not available',
      dbError: isProd ? 'Database unavailable' : (dbError || 'Database is not connected'),
      dbType: isProd ? undefined : dbType,
      dbStatus,
    });
  }
  next();
});
```

Chosen deliberately over `TODO.md`'s `dbError: isProd ? undefined : ...`: keeping a **masked non-empty
string** (same wording `/api/health` already uses) means the client's existing truthiness check keeps
working and the operator still sees *that* it is a DB problem. Dropping the key entirely is what creates
the silent-fallthrough trap above.

`dbType` is dropped in production because it names the backend to an anonymous caller for no operational
benefit — the client only uses it for display. If you keep `dbType`, the client's `|| 'unknown'` fallbacks
already cover its absence either way.

**2. `client/src/App.tsx:174-182`** — make the DB-down screen independent of the body contents:

```ts
      } catch (err: any) {
        // A 503 from the '/api' gate means the server is up but its DB is not.
        // The body is deliberately generic in production, so don't require it.
        if (err.response?.status === 503) {
          setDbError({
            dbType: err.response.data?.dbType || 'unknown',
            dbError: err.response.data?.dbError || 'The server cannot reach its database — check the server logs.',
          });
        }
        // Otherwise just continue — LoginPage will handle it
      } finally {
```

Do not touch `DbErrorScreen` itself; it renders whatever string it is given and the "How to fix this"
panel stays useful.

### Tests

The honest test is an API-level one, and it needs a booted app with a dead DB. Two options — pick the
first:

- **Pure unit test of the masking decision.** Extract the body builder next to the gate:

  ```ts
  // server/src/index.ts
  export function dbDownBody(args: { dbStatus: string; dbError: string | null; dbType: string; isProd: boolean }) {
    return {
      message: 'Database not available',
      dbError: args.isProd ? 'Database unavailable' : (args.dbError || 'Database is not connected'),
      dbType: args.isProd ? undefined : args.dbType,
      dbStatus: args.dbStatus,
    };
  }
  ```

  and have the middleware call it. Then `server/src/tests/dbGate.test.ts` asserts that for
  `isProd: true` with `dbError: "Access denied for user 'u'@'1.2.3.4' (using password: YES)"` the result
  contains neither `'Access denied'`, nor `'sql7'`, nor `'@'`, and that for `isProd: false` it passes the
  message through. **Caveat:** importing `index.ts` runs `bootstrap()` (it is called at module scope,
  `:267`). Put `dbDownBody` in a new `server/src/utils/dbGate.ts` instead and import it from `index.ts` —
  then the test imports the util with no side effects. Do it that way.

- A live-server e2e in the `server/test-e2e.ts` / `auth.e2e.test.ts` style, booted with
  `NODE_ENV=production` and a deliberately-unreachable `DB_HOST`, asserting `GET /api/collections` → 503
  with a body that does not contain the host string. Heavier; only if the unit test above is judged
  insufficient.

**Done when:** with `NODE_ENV=production` and an unreachable DB, `curl -i localhost:3005/api/collections`
returns 503 whose body contains neither the DB host, user, nor driver text; the client still shows the
full-screen DB error page (verify in a browser, not only by unit test); and with `NODE_ENV=development`
the real message is still shown.

---

## SEC-11 — OAuth `state` / CSRF

**Status: real, unfixed. `grep -n "state" server/src/routes/auth.ts` → no OAuth state anywhere.**

### Verified current state

`server/src/routes/auth.ts:183-268`, `POST /api/auth/google`, takes `{ code, redirectUri }`, allowlists
`redirectUri` against `GOOGLE_ALLOWED_REDIRECT_URIS` (`:193-198`), exchanges the code, upserts the user,
and sets the session cookie. There is no `state` parameter at any point.

The authorize URL is built **on the client, in two places**:
- `client/src/pages/LoginPage.tsx:33-34`
- `client/src/pages/RegisterPage.tsx:34-35`

both as:

```ts
const redirectUri = window.location.origin + '/auth/google/callback';
const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.googleOAuth.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent`;
```

`config.googleOAuth.clientId` comes from the public `GET /api/auth/config`
(`server/src/routes/auth.ts:146-157`).

`client/src/pages/OAuthCallbackPage.tsx` reads only `code` from the query string and posts
`{ code, redirectUri }`.

Attack this closes: an attacker completes an authorize flow, captures their own `code`, and gets a victim
to load `/auth/google/callback?code=<attacker_code>`. The victim's browser posts it, the server exchanges
it, and the victim is silently logged into the **attacker's** account — where the attacker can then read
anything the victim creates. Without `state` there is nothing tying the callback to a flow the victim
actually started.

### Changes

Design choice: **keep URL construction on the client** and add a tiny state-issuing endpoint. `TODO.md`
proposes moving the whole authorize URL server-side (`GET /api/auth/google/start` returning
`{ state, authUrl }`); that is also fine but duplicates the `redirect_uri`/scope logic server-side and
touches more code. The double-submit-cookie check below is the standard mitigation and is smaller.

**1. New route in `server/src/routes/auth.ts`, next to the others:**

```ts
import crypto from 'crypto';

// ── GET /api/auth/google/state ──────────────────────────────────────────────
// Issues a one-time CSRF token for an OAuth authorize round-trip. The client
// puts it in the authorize URL's `state`; Google echoes it back to the callback
// page, which sends it here for comparison against this httpOnly cookie. Without
// it, an attacker's authorization code can be redeemed in a victim's browser,
// silently logging the victim into the attacker's account.
router.get('/state', loginLimiter, (_req: Request, res: Response) => {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });
  return res.json({ state });
});
```

`sameSite: 'lax'` is required, not `'strict'`: the callback is reached by a **top-level cross-site
redirect from Google**, and a `strict` cookie is not sent on that navigation. `lax` does send it for
top-level GET navigations, which is exactly this case. The cookie attributes intentionally mirror
`authCookieOptions()` in `server/src/middleware/auth.ts:37-44` (`httpOnly`, `secure` in prod, `lax`,
`path: '/'`) — `clearCookie` only removes a cookie when the attributes match, so keep them identical to
what is set here.

Mount path note: `auth.ts` is mounted at `/api/auth` (`server/src/index.ts:160`), so this is
`GET /api/auth/state`. If you prefer `/api/auth/google/state`, use `router.get('/google/state', ...)` —
just keep the client in sync. Naming it generically (`/state`) lets a second SSO provider reuse it.

**2. `POST /api/auth/google` — verify first, before the code is ever exchanged.** Insert immediately after
`:185` (`if (!code) ...`):

```ts
  const { code, redirectUri, state } = req.body;
  if (!code) return res.status(400).json({ message: 'Code is required' });

  // CSRF: the state must match the httpOnly cookie issued by GET /api/auth/state.
  // Checked before the code is exchanged so an attacker-supplied code is never redeemed.
  const cookieState = req.cookies?.oauth_state;
  const ok =
    typeof state === 'string' &&
    typeof cookieState === 'string' &&
    state.length === cookieState.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState));
  // One-time use: clear it whether or not it matched, so a leaked state cannot be replayed.
  res.clearCookie('oauth_state', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
  });
  if (!ok) return res.status(400).json({ message: 'Invalid OAuth state' });
```

`timingSafeEqual` throws on unequal lengths, hence the explicit length check first. A plain `!==` compare
would also be acceptable here (the value is single-use and high-entropy), but this costs one line.

`cookieParser()` is already mounted (`server/src/index.ts:121`) so `req.cookies` is populated.

**3. Client — `LoginPage.tsx` and `RegisterPage.tsx`.** Both currently build the URL synchronously in a
click handler. Make the handler async, fetch the state, append it:

```ts
const { data } = await api.get('/auth/state');
const redirectUri = window.location.origin + '/auth/google/callback';
const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.googleOAuth.clientId}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile` +
  `&access_type=offline&prompt=consent&state=${encodeURIComponent(data.state)}`;
window.location.href = googleAuthUrl;
```

Wrap the `api.get` in try/catch and surface a normal error message on failure — do **not** fall back to
launching the flow without `state`, or the check is trivially bypassed by making that one request fail.
The two pages duplicate this block today; extracting a `startGoogleOAuth(config)` helper (e.g.
`client/src/api/oauth.ts`) is the better shape and keeps the two call sites from drifting.

**4. `client/src/pages/OAuthCallbackPage.tsx`** — read `state` from the query string and send it back:

```ts
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code) {
      setError('No authorization code provided.');
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;

    api.post('/auth/google', { code, redirectUri, state })
```

Do not try to carry `state` in React state or `sessionStorage` across the redirect — the browser leaves
the app entirely and comes back on a fresh page load. The query string (from Google) plus the cookie
(from the server) is the whole mechanism.

### Tests

`server/src/tests/oauthState.test.ts` — supertest against the auth router alone, which avoids importing
`index.ts` and its `bootstrap()`:

```ts
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRouter from '../routes/auth';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  return app;
}
```

Cases:
1. `GET /api/auth/state` → 200, body has a 64-char hex `state`, and `set-cookie` contains
   `oauth_state=...; HttpOnly` with `SameSite=Lax`.
2. `POST /api/auth/google` with `{ code: 'x' }` and **no** cookie → 400 `Invalid OAuth state`.
3. `POST /api/auth/google` with `{ code: 'x', state: 'deadbeef' }` and a cookie holding a different value
   → 400.
4. Two different `GET /state` calls return different values (not a constant).
5. Matching state → must **not** 400 on the state check. This one reaches the Google token exchange, so
   either stop at asserting the status is not 400-with-that-message, or have the test set
   `googleOAuth.enabled = false` so it returns 403 `Google OAuth is disabled` — proving the state check
   passed and execution moved on. The 403 assertion is the cleaner signal.

Note the routes are wrapped in `loginLimiter` (15 requests / 15 min per IP). More than 15 requests from
the test's IP inside one window will start returning 429 — keep the suite under that, or export the
limiter's reset for tests. Case 4 plus cases 1-3 is 5 requests; fine.

**Done when:** all five cases pass, a manual Google login still works end to end in a browser, and a
callback URL with a hand-edited `state` value shows the OAuth error screen instead of logging in.

---

## SEC-10 — Baseline HTTP hardening, the remaining half

**Status: real, unfixed — but `TODO.md`'s proposed CSP will break the app in at least three ways. Read
SEC-10.0 before writing any code. Do this item last.**

### SEC-10.0 — Blockers found in the current client (verified)

1. **`new Function` in two live code paths.** `client/src/utils/scripts.ts:134` and `:312`
   (`new Function('pm', 'reqSpace', '_', 'moment', 'CryptoJS', 'console', script)`) and
   `client/src/sandbox/worker.ts:77`. `TODO.md` proposes `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]`;
   **`'wasm-unsafe-eval'` does not permit `new Function`** — only WebAssembly compilation. Pre-request and
   test scripts would throw `EvalError` under that policy. Options:
   - ship CSP **with** `'unsafe-eval'` now (still blocks injected remote scripts, inline handlers and
     `object-src`, which is most of the value), or
   - block SEC-10 on SEC-3 (script sandbox), which is explicitly out of scope.

   Recommended: ship with `'unsafe-eval'` and a comment naming SEC-3 as the follow-up that removes it.
   Do not ship a policy that silently breaks scripts.

2. **Monaco is loaded from a CDN at runtime.** `client/package.json` depends on `@monaco-editor/react@^4.7.0`
   but **not** on `monaco-editor`, and `grep -rn "loader.config" client/src` finds nothing — so the loader
   fetches `https://cdn.jsdelivr.net/npm/monaco-editor@*/min/vs/...` on demand. `script-src 'self'` breaks
   **every** editor in the app (`BodyEditor.tsx`, `ScriptEditor.tsx`, `ResponseViewer.tsx`). Fix properly,
   as part of this item:

   ```bash
   npm --prefix client install monaco-editor
   ```
   ```ts
   // client/src/main.tsx (once, before any editor renders)
   import { loader } from '@monaco-editor/react';
   import * as monaco from 'monaco-editor';
   loader.config({ monaco });
   ```

   This also removes a live third-party supply-chain dependency from the critical path and makes the app
   work offline. Expect the bundle to grow substantially (Monaco is ~2-3 MB before gzip) and the existing
   "chunk larger than 500 kB" warning to get louder — that is acceptable here, but configure
   `build.rollupOptions`/`codeSplitting` if the build starts timing out. The cheap alternative —
   allowlisting `https://cdn.jsdelivr.net` in `script-src` — keeps the CDN trust and is **not**
   recommended.

3. **The visualizer iframe needs the CDN and inline script.**
   `client/src/components/response/ResponseViewer.tsx:535-560` renders an iframe via **`srcDoc`**, which
   inherits the parent's CSP. Inside it: `<script src="https://cdn.jsdelivr.net/npm/handlebars@latest/...">`
   plus an inline `<script>` that compiles the user's template. Under any reasonable policy this breaks
   twice. Fix: install `handlebars` as a client dependency, compile the template **in the parent** and put
   only the resulting HTML in the iframe, with `sandbox=""` (no scripts at all):

   ```tsx
   import Handlebars from 'handlebars';
   // ...
   const html = useMemo(() => {
     try {
       return Handlebars.compile(activeResponse.visualizerData!.template)(activeResponse.visualizerData!.data || {});
     } catch (e: any) {
       return `<div style="color:red;font-family:monospace">Visualizer Error: ${escapeHtml(e.message)}</div>`;
     }
   }, [activeResponse.visualizerData]);
   // <iframe sandbox="" srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:10px;margin:0}</style></head><body>${html}</body></html>`} />
   ```

   Note `@latest` in the current CDN URL is itself a supply-chain problem (unpinned, fetched at render
   time) — this change removes it. Also note the template is user-controlled, so it must render inside a
   `sandbox=""` iframe (no `allow-scripts`, no `allow-same-origin`) — keep that attribute.

4. **Google favicon is hotlinked.** `LoginPage.tsx:83` and `RegisterPage.tsx:111` use
   `<img src="https://www.google.com/favicon.ico">`. Either add `https://www.google.com` to `img-src` or
   (better) vendor a local `google.svg` into `client/public/` and reference it as `/google.svg`.

5. **Dev-mode differences.** Vite's dev server uses inline scripts and a `ws://localhost:5173` HMR socket,
   and `helmet` runs in dev too. Gate the strict policy on `NODE_ENV === 'production'` and keep a looser
   dev policy, or the dev server becomes unusable.

Do items 2-4 (and decide 1) **before** enabling CSP, verify the app in a browser with a clean console, and
only then turn the header on.

### Changes — CSP

`server/src/index.ts:115`, currently `app.use(helmet({ contentSecurityPolicy: false }));`:

```ts
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-eval' is required by the pre-request/test script runner
      // (client/src/utils/scripts.ts uses new Function). SEC-3 (script sandbox)
      // is what removes it; 'wasm-unsafe-eval' alone does NOT cover new Function.
      scriptSrc: ["'self'", "'unsafe-eval'"],
      // Tailwind and the inline <style> blocks in App.tsx inject styles.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      // 'self' covers same-origin ws:// for socket.io; dev also needs the Vite HMR socket.
      connectSrc: isProd ? ["'self'"] : ["'self'", 'ws:', 'wss:', 'http://localhost:5173'],
      workerSrc: ["'self'", 'blob:'],
      frameSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  hsts: isProd ? { maxAge: 15552000, includeSubDomains: false } : false,
}));
```

HSTS notes: start at 180 days (`15552000`) rather than a year, and **leave `includeSubDomains` off** for
the first rollout — HSTS is cached by browsers and cannot be un-done remotely, and this deployment is
reached over a Tailscale Funnel hostname (`itay-office.tail8a006d.ts.net`) where a mistaken
`includeSubDomains` is awkward to reverse. Raise it once the header has been live and stable.

Rollout technique — **use report-only first.** Helmet can emit
`Content-Security-Policy-Report-Only` instead by setting `reportOnly: true`; ship that, click through
every screen (editors, visualizer, runner, admin, share page, OAuth), collect violations from the console,
and only then flip to enforcing. This is the single highest-value step in this item.

Also consider `srcDoc` iframes: they are `blob:`/opaque-origin documents, hence `frameSrc: blob:` above.
Verify the visualizer and any other `srcDoc` iframe renders with the policy on.

### Changes — rate limiting

`server/src/middleware/rateLimit.ts` currently keys strictly by `req.ip`:

```ts
export function rateLimit(options: { windowMs: number; max: number; message?: string }) {
  // ...
  const key = req.ip ?? 'unknown';
```

Add an optional `keyBy`, keeping the current behaviour as the default:

```ts
export function rateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyBy?: (req: Request) => string;
}) {
  // ...
    const key = (options.keyBy ? options.keyBy(req) : req.ip) ?? 'unknown';
```

Then in `server/src/index.ts`, after the DB-ready gate and **before** the route mounts:

```ts
// Blanket write throttle. Login/register have their own tighter limits in
// routes/auth.ts; this bounds everything else so one client cannot hammer the
// API with writes. Per-process only — see SOCK-3 for a shared store.
const mutationLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  message: 'Too many requests — please slow down.',
});
app.use('/api', (req, res, next) =>
  (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')
    ? mutationLimiter(req, res, next)
    : next());
```

**Important correction to `TODO.md` here:** it proposes `keyBy: (req) => (req as AuthRequest).user?._id ?? req.ip`
at this mount point. That does not work — this middleware runs **before** any router's `authenticate`, so
`req.user` is always `undefined` and the limiter silently degrades to IP-keying. Either accept IP-keying
(recommended: `app.set('trust proxy', ...)` is already configured at `index.ts:109`, so `req.ip` is the
real client IP behind the proxy) or mount a user-keyed limiter **inside** individual routers after
`authenticate`. Do not write a `keyBy` that reads an unverified token claim — a forged `sub` would let an
attacker pick someone else's bucket.

Threshold sanity check before shipping: 300 writes/minute/IP must not throttle legitimate use. The
collection runner and the reorder endpoints issue bursts of writes, and everyone behind one office NAT
shares an IP. Verify against a real runner execution over a large collection; raise the cap or exempt
`/api/runner` if it trips. A limiter that fires on normal use is worse than none, because it will be
removed wholesale in a panic.

`max_restarts` / `restart_delay` are still unset in `ecosystem.config.js` — unrelated to SEC-10, but
worth fixing in the same pass since a crash loop there is how this deployment failed before.

### Tests

- `server/src/tests/rateLimit.test.ts` — pure unit against the middleware with fake `req`/`res`:
  request `max` times → all `next()`; request `max + 1` → 429 with a `Retry-After` header; a custom
  `keyBy` separates buckets; advancing time past `windowMs` (use `jest.useFakeTimers()`) resets the
  window.
- CSP header presence: assert on the response headers of any request once `app` is exported (see the
  general rules) — `expect(res.headers['content-security-policy']).toContain("object-src 'none'")`.
- **Manual, and non-negotiable:** load the built client and exercise body editor, script editor with a
  real pre-request script, response viewer, visualizer tab, collection runner, share page and the OAuth
  button with the console open. Zero CSP violations. Type-checking cannot catch a CSP regression.

**Done when:** the CSP header is present in production responses, the console is violation-free across all
the screens above, Monaco loads with the network offline (proving it is bundled, not CDN-fetched), the
301st write in a minute returns 429, and a full collection-runner execution does **not**.

---

## Related findings turned up while verifying (decide, don't silently inherit)

1. **`GET /api/auth/config` hardcodes `allowSelfRegistration: true`** (`server/src/routes/auth.ts:152`)
   while `POST /api/auth/register` now enforces `config?.auth?.allowSelfRegistration` (uncommitted change
   in the working tree at the time of writing). The client will therefore offer a Register screen that the
   server rejects with 403. Fix: return the real value,
   `allowSelfRegistration: config?.auth?.allowSelfRegistration ?? false`.
2. **Uncommitted working-tree changes** at `ff0d60f`: `server/src/routes/auth.ts` (the
   `if (false)` → `if (!config?.auth?.allowSelfRegistration)` fix, two sites) and three
   `tests/e2e/*.spec.ts` files swapping `import { v4 as uuidv4 } from 'uuid'` for
   `require('crypto').randomUUID`. These are someone else's in-flight work — do not revert or commit them
   as part of a SEC change; check with the owner first.
3. **`client/src/store/settingsStore.ts` still persists `proxyPassword`** to `localStorage` under
   `reqspace-global-settings` (no `partialize`). SEC-4 deliberately left it: the local-proxy password is
   still functionally needed, and the real fix is SEC-0, which is out of scope. Open decision — if it must
   go now, the cost is that proxy auth stops surviving a page reload.
4. **`client/src/sandbox/worker.ts` already exists**, so SEC-3 may be partly built. Check its state before
   anyone starts SEC-3 or relaxes the `'unsafe-eval'` decision in SEC-10.
5. **`RequestRepository.searchInWorkspace` is dead code** (no route; client search is in-memory over
   `collectionStore`). See SEC-6 step 5.
6. **`server/src/utils/escapeRegex.ts` has no remaining callers** once SEC-6 drops the unused import in
   `users.ts`. Either delete it or leave it with a comment saying it is kept for future regex use — an
   orphan security util that nothing calls tends to get "reused" incorrectly later.
