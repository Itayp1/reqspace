/**
 * Shared Playwright fixtures. Every spec imports `test` / `expect` from here
 * instead of '@playwright/test', which adds one automatic step to every test:
 *
 *   The test's window (title, start, end) and the faults it declared are
 *   appended to test-results/.fperrors-allowed.jsonl.
 *
 * `fperrors` is where the app records its own faults — server 5xx responses,
 * uncaught server exceptions, browser `window.onerror` / unhandled rejections,
 * React render crashes and failed API calls (see utils/errorReporter.ts on
 * both sides). A test can pass every assertion and still have made the app
 * throw somewhere along the way.
 *
 * Nothing is queried per test (that cost a wait and an API call every time).
 * Once the run is over, global-teardown.ts reads the table, attributes each
 * row to the test whose window it falls in, and fails the run on any row that
 * no test declared.
 *
 * A test that provokes a fault on purpose declares it:
 *
 *   test.use({ allowFpErrors: [/SMTP connection failed/] });
 *
 * FPERRORS_GUARD=off disables the bookkeeping and the end-of-run check.
 */
import { test as base, expect, request as playwrightRequest, type APIRequestContext, type TestInfo } from '@playwright/test';
import { withElectron } from './electron-target';
import fs from 'fs';
import path from 'path';

export * from '@playwright/test';

export const API_URL = process.env.REQSPACE_API_URL || 'http://localhost:3005';
const ALLOWED_LOG = path.resolve(__dirname, '..', '..', process.env.REQSPACE_RESULTS_DIR || 'test-results', '.fperrors-allowed.jsonl');

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
  const passwords = ['admin123456'];
  for (const password of passwords) {
    const res = await ctx.post('/api/auth/login', { data: { email: 'admin', password } });
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

/** Whether a declared pattern covers a fault (matched against "kind message route"). Shared with global-teardown.ts. */
export function matches(pattern: RegExp | string, g: Pick<FpErrorGroup, 'kind' | 'message' | 'route'>): boolean {
  const text = `${g.kind} ${g.message} ${g.route ?? ''}`;
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
}

// One line per test: its title, the window it ran in, and the faults it declared.
// RegExp patterns are stored as { re, flags } so they can be rebuilt in global-teardown.ts.
function recordTest(testInfo: TestInfo, started: Date, allow: Array<RegExp | string>) {
  const line = {
    test: testInfo.titlePath.join(' > '),
    start: started.toISOString(),
    end: new Date().toISOString(),
    allow: allow.map(p => (typeof p === 'string' ? p : { re: p.source, flags: p.flags })),
  };
  fs.mkdirSync(path.dirname(ALLOWED_LOG), { recursive: true });
  fs.appendFileSync(ALLOWED_LOG, JSON.stringify(line) + '\n');
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

  fpErrorGuard: [async ({ allowFpErrors }, use, testInfo) => {
    if (process.env.FPERRORS_GUARD === 'off') {
      await use();
      return;
    }
    const started = new Date();
    await use();
    recordTest(testInfo, started, allowFpErrors);
  }, { auto: true }],
});

// REQSPACE_TARGET=electron runs every spec inside the real desktop app (see electron-target.ts).
export const test: typeof webTest = process.env.REQSPACE_TARGET === 'electron' ? withElectron(webTest) : webTest;

export { expect };

/** Admin → Settings groups start collapsed; open them all so their fields can be used. */
export async function expandAdminSections(page: import('@playwright/test').Page) {
  const closed = page.locator('[data-testid="admin-section-toggle"][aria-expanded="false"]');
  await page.getByTestId('admin-section-toggle').first().waitFor();
  while (await closed.count()) await closed.first().click();
}
