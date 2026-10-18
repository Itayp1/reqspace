/**
 * Runs the same specs against the real desktop app instead of a browser tab.
 *
 * Enabled with REQSPACE_TARGET=electron (see scripts/run-e2e-targets.js and the
 * `electron` project in playwright.config.ts). fixtures.ts then swaps the `context`
 * and `page` fixtures for an Electron window, so specs need no changes:
 *
 *  - main.js is launched with a throw-away --user-data-dir whose config.json points
 *    the window at the Vite client ("remote" mode), i.e. the exact same app and API
 *    the browser project tests - but with the real preload bridge, so
 *    `window.electron.sendRequest` (electron/httpRequest.js) is the transport.
 *  - An Electron page has no baseURL, so relative page.goto('/x') and
 *    page.request.get('/api/x') are resolved against the client origin here.
 *  - One fresh app per test keeps localStorage/cookies isolated, like a new browser context.
 */
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const CLIENT_URL = `http://localhost:${process.env.CLIENT_PORT || '5173'}`;
const REQUEST_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch']);

/**
 * Electron saves downloads itself (and would show a native Save dialog), and Playwright does not emit
 * 'download' events for Electron windows. Save every download into `dir` from the main process and make
 * page.waitForEvent('download') resolve to a Download-like object for the Nth download.
 */
async function captureDownloads(page: Page, app: ElectronApplication, dir: string) {
  await app.evaluate(({ session }, saveDir) => {
    const g = globalThis as any;
    g.__downloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const name = item.getFilename().replace(/[\/:*?"<>|]/g, '_') || 'download';
      const file = `${saveDir}/${g.__downloads.length}-${name}`;
      const rec = { name, file, state: 'progressing' };
      g.__downloads.push(rec);
      item.setSavePath(file); // no native Save dialog
      item.once('done', (_e, state) => { rec.state = state; });
    });
  }, dir);

  let consumed = 0;
  const waitForEvent = page.waitForEvent.bind(page) as (...a: any[]) => Promise<any>;
  (page as any).waitForEvent = async (event: string, ...rest: any[]) => {
    if (event !== 'download') return waitForEvent(event, ...rest);
    const index = consumed++;
    const deadline = Date.now() + 15_000;
    for (;;) {
      const all = await app.evaluate(() => (globalThis as any).__downloads as { name: string; file: string; state: string }[]);
      const d = all[index];
      if (d && d.state !== 'progressing') {
        return {
          suggestedFilename: () => d.name,
          path: async () => d.file,
          saveAs: async (dest: string) => fs.copyFileSync(d.file, dest),
          failure: async () => (d.state === 'completed' ? null : d.state),
          url: () => '',
        };
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for download #${index + 1}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
}

function absolutize(page: Page) {
  const goto = page.goto.bind(page);
  (page as any).goto = (url: string, options?: any) => goto(new URL(url, CLIENT_URL).toString(), options);

  const ctxRequest = page.context().request;
  const request = new Proxy(ctxRequest, {
    get(target, prop) {
      const value = (target as any)[prop];
      if (typeof value !== 'function') return value;
      if (REQUEST_METHODS.has(String(prop))) {
        return (url: any, ...rest: any[]) =>
          value.call(target, typeof url === 'string' && url.startsWith('/') ? CLIENT_URL + url : url, ...rest);
      }
      return value.bind(target);
    },
  });
  Object.defineProperty(page, 'request', { get: () => request });
}

export const CLIENT_ORIGIN = CLIENT_URL;
export const MAIN_JS = path.join(ROOT, 'main.js');

/** A fresh --user-data-dir whose config.json points the window at the Vite client. */
export function makeUserDataDir(): string {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'reqspace-electron-'));
  fs.mkdirSync(path.join(userData, 'reqspace'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'reqspace', 'config.json'), JSON.stringify({ mode: 'remote', url: CLIENT_URL }));
  return userData;
}

export function electronEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE; // would start Electron as plain Node, with no window
  return env;
}

/**
 * transport 'real'  = the window has the preload bridge (window.electron.sendRequest -> Node http in the main process).
 * transport 'web'   = the bridge is hidden (--e2e-web-transport), so the renderer uses fetch() like a browser and
 *                     Playwright's page.route() mocks apply. Requests made by the real bridge run in Node and
 *                     cannot be intercepted by page.route, which is what most UI specs rely on.
 */
export function launchDesktopApp(userData: string, transport: 'real' | 'web' = 'real'): Promise<ElectronApplication> {
  const flag = transport === 'web' ? ['--e2e-web-transport'] : [];
  // Automation hosts often report no pointing device, which makes Chromium evaluate `(hover: hover)` as false
  // and hides every Tailwind `group-hover:` control. Declare a mouse so the window behaves like a desktop.
  const pointer = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
  return _electron.launch({ args: [pointer, MAIN_JS, `--user-data-dir=${userData}`, ...flag], cwd: ROOT, env: electronEnv() });
}

export function withElectron(base: any): any {
  return base.extend({
    // Specs that exercise the real desktop transport opt in with test.use({ desktopTransport: 'real' }).
    desktopTransport: ['web', { option: true }],
    electronApp: async ({ desktopTransport }: any, use: (app: ElectronApplication) => Promise<void>) => {
      const userData = makeUserDataDir();
      const app = await launchDesktopApp(userData, desktopTransport);
      await use(app);
      await app.close().catch(() => {});
      fs.rmSync(userData, { recursive: true, force: true });
    },
    context: async ({ electronApp, browser }: any, use: (c: unknown) => Promise<void>) => {
      const context = electronApp.context();
      // Specs open extra sessions with context.browser().newContext() (anonymous viewers, a second user).
      // An Electron context has no browser, so those run in the regular Chromium instance.
      context.browser = () => browser;
      await use(context);
    },
    page: async ({ electronApp }: any, use: (p: Page) => Promise<void>) => {
      const page: Page = await electronApp.firstWindow();
      // The window starts loading the app by itself; start every test from a blank page, like a new
      // browser tab, so a test's own page.goto() cannot race the app's startup redirect.
      await page.goto('about:blank');
      absolutize(page);
      const downloadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqspace-downloads-'));
      await captureDownloads(page, electronApp, downloadsDir);
      await use(page);
      fs.rmSync(downloadsDir, { recursive: true, force: true });
    },
  });
}
