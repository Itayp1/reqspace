/**
 * Shared Playwright fixtures. Every spec imports `test` / `expect` from here
 * instead of '@playwright/test', which adds one automatic check to every test:
 *
 *   A test must not leave new rows in the `fperrors` table.
 *
 * `fperrors` is where the app records its own faults — server 5xx responses,
 * uncaught server exceptions, browser `window.onerror` / unhandled rejections,
 * React render crashes and failed API calls (see utils/errorReporter.ts on
 * both sides). A test can pass every assertion and still have made the app
 * throw somewhere along the way; this catches that.
 *
 * How: before the test the guard notes the time; afterwards it asks the
 * backend (as the seeded superadmin) for every error group recorded since,
 * via GET /api/admin/errors?since=…. Anything there fails the test, with the
 * occurrences attached to the report.
 *
 * A test that provokes a fault on purpose declares it:
 *
 *   test.use({ allowFpErrors: [/SMTP connection failed/] });
 *
 * global-teardown.ts additionally reads the table directly at the end of the
 * run, so faults that land between tests (or after the last one) still show
 * up.
 */
import { test as base, expect, request as playwrightRequest, type APIRequestContext, type TestInfo } from '@playwright/test';
import { withElectron } from './electron-target';
import fs from 'fs';
import path from 'path';

export * from '@playwright/test';

export const API_URL = process.env.REQSPACE_API_URL || 'http://localhost:3005';
const ALLOWED_LOG = path.resolve(__dirname, '..', '..', process.env.REQSPACE_RESULTS_DIR || 'test-results', '.fperrors-allowed.jsonl');
// How long to give fire-and-forget writes (server recordError, the browser's
// keepalive POST /api/errors) to land before reading the table.
const SETTLE_MS = Number(process.env.FPERRORS_SETTLE_MS || 750);

export interface FpErrorGroup {
  fingerprint: string;
  source: string;
  kind: string;
  message: string;
  route: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

async function loginAsAdmin(ctx: APIRequestContext): Promise<void> {
  const passwords = [process.env.REQSPACE_ADMIN_PASSWORD, 'admin', 'admin123456'].filter(Boolean) as string[];
  for (const password of passwords) {
    const res = await ctx.post('/api/auth/login', { data: { email: process.env.REQSPACE_ADMIN_EMAIL || 'admin', password } });
    if (res.ok()) return;
  }
  throw new Error('fperrors guard: could not log in as the seeded admin to read /api/admin/errors');
}

async function newAdminContext(): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({
    baseURL: API_URL,
    // Its own rate-limit bucket (the server trusts one proxy hop), so the
    // guard's reads never eat into the browser's request budget.
    extraHTTPHeaders: { 'X-Forwarded-For': '10.255.0.1' },
  });
  await loginAsAdmin(ctx);
  return ctx;
}

export async function fetchFpErrorsSince(ctx: APIRequestContext, since: Date): Promise<FpErrorGroup[]> {
  let res = await ctx.get('/api/admin/errors', { params: { since: since.toISOString(), limit: '200' } });
  if (res.status() === 401) {
    await loginAsAdmin(ctx);
    res = await ctx.get('/api/admin/errors', { params: { since: since.toISOString(), limit: '200' } });
  }
  if (!res.ok()) throw new Error(`fperrors guard: GET /api/admin/errors answered ${res.status()}: ${await res.text()}`);
  const body = await res.json();
  return body.groups as FpErrorGroup[];
}

async function fetchOccurrences(ctx: APIRequestContext, fingerprint: string) {
  const res = await ctx.get(`/api/admin/errors/${fingerprint}`);
  return res.ok() ? (await res.json()).items : [];
}

function matches(pattern: RegExp | string, g: FpErrorGroup): boolean {
  const text = `${g.kind} ${g.message} ${g.route ?? ''}`;
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
}

function recordAllowed(groups: FpErrorGroup[], testInfo: TestInfo) {
  if (!groups.length) return;
  try {
    fs.mkdirSync(path.dirname(ALLOWED_LOG), { recursive: true });
    fs.appendFileSync(ALLOWED_LOG, groups.map(g => JSON.stringify({ fingerprint: g.fingerprint, test: testInfo.titlePath.join(' › ') })).join('\n') + '\n');
  } catch {
    // only feeds the end-of-run summary
  }
}

type TestFixtures = {
  /** Patterns (matched against "kind message route") of faults this test causes on purpose. */
  allowFpErrors: Array<RegExp | string>;
  fpErrorGuard: void;
};

type WorkerFixtures = {
  fpErrorsApi: APIRequestContext;
};

const webTest = base.extend<TestFixtures, WorkerFixtures>({
  allowFpErrors: [[], { option: true }],

  fpErrorsApi: [async ({}, use) => {
    const ctx = await newAdminContext();
    await use(ctx);
    await ctx.dispose();
  }, { scope: 'worker' }],

  fpErrorGuard: [async ({ fpErrorsApi, allowFpErrors }, use, testInfo) => {
    if (process.env.FPERRORS_GUARD === 'off') {
      await use();
      return;
    }
    const since = new Date();
    await use();
    await new Promise(r => setTimeout(r, SETTLE_MS));

    const groups = await fetchFpErrorsSince(fpErrorsApi, since);
    const allowed = groups.filter(g => allowFpErrors.some(p => matches(p, g)));
    const unexpected = groups.filter(g => !allowed.includes(g));
    recordAllowed(allowed, testInfo);
    if (!unexpected.length) return;

    const details = [];
    for (const g of unexpected) details.push({ ...g, occurrences: await fetchOccurrences(fpErrorsApi, g.fingerprint) });
    await testInfo.attach('fperrors.json', { body: JSON.stringify(details, null, 2), contentType: 'application/json' });
    const lines = unexpected.map(g => `  • [${g.source}/${g.kind}] ${g.message}${g.route ? `  (${g.route})` : ''} ×${g.count}`);
    throw new Error(
      `This test left ${unexpected.length} new fault(s) in the fperrors table:\n${lines.join('\n')}\n` +
      'See the fperrors.json attachment for stacks. If the fault is intended, declare it with test.use({ allowFpErrors: [...] }).',
    );
  }, { auto: true }],
});

// REQSPACE_TARGET=electron runs every spec inside the real desktop app (see electron-target.ts).
export const test: typeof webTest = process.env.REQSPACE_TARGET === 'electron' ? withElectron(webTest) : webTest;

export { expect };
