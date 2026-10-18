const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const { sendRequest: nodeSendRequest } = require('./electron/httpRequest');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

// ── Single instance (T10.1) ──────────────────────────────────────────────────
// A second launch would open a second window and, in local mode, a second server on the
// same port. Hand over to the running instance instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

// ── External links and navigation lock (T7.1, T5.4) ──────────────────────────
// The renderer shows content from a server that may be remote, so it must not be able to open
// other sites inside the app window. Links to other sites go to the system browser instead.
function openExternally(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') shell.openExternal(url);
  } catch { /* malformed URL: ignore */ }
}
// Sign-in providers the login page redirects the whole window to (authorization-code flow:
// LoginPage sets window.location to the provider, which redirects back to /auth/*/callback).
// They must stay inside the window or the callback would land in the system browser.
const IDENTITY_PROVIDER_HOSTS = new Set([
  'accounts.google.com',
  'github.com',
  'login.microsoftonline.com', // Microsoft Entra ID
  'login.live.com',
]);
function appOrigin() {
  const cfg = readConfig();
  try {
    if (cfg && cfg.mode === 'remote' && cfg.url) return new URL(cfg.url).origin;
  } catch { /* fall through */ }
  return 'http://localhost:3005';
}
// The admin can add a custom OAuth2/OIDC provider whose authorize URL is on any host, so the fixed list
// above cannot cover it. Ask the app's own server which authorize URL is configured (public, no secrets)
// and allow navigating to exactly that endpoint.
let customIdpCache = { at: 0, authorizeUrl: '' };
async function customAuthorizeUrl() {
  if (Date.now() - customIdpCache.at < 30000) return customIdpCache.authorizeUrl;
  let authorizeUrl = '';
  try {
    const res = await fetch(appOrigin() + '/api/auth/config', { signal: AbortSignal.timeout(3000) });
    const cfg = await res.json();
    if (cfg && cfg.customOAuth && cfg.customOAuth.enabled) authorizeUrl = cfg.customOAuth.authorizeUrl || '';
  } catch { /* server unreachable: treat as not configured */ }
  customIdpCache = { at: Date.now(), authorizeUrl };
  return authorizeUrl;
}
async function isConfiguredCustomIdp(url) {
  try {
    const configured = new URL(await customAuthorizeUrl());
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === configured.origin && u.pathname === configured.pathname;
  } catch { return false; }
}
function isAllowedNavigation(url) {
  try {
    const u = new URL(url);
    if (u.origin === appOrigin()) return true;
    return u.protocol === 'https:' && IDENTITY_PROVIDER_HOSTS.has(u.hostname);
  } catch { return false; }
}

// ── Config file (persists user's choice) ─────────────────────────────────────
const configDir = path.join(app.getPath('userData'), 'reqspace');
const configFile = path.join(configDir, 'config.json');

function readConfig() {
  try {
    if (fs.existsSync(configFile)) {
      return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ── SQLite location ──────────────────────────────────────────────────────────
// Default: next to the executable (the portable build's own folder when set). If that folder is
// not writable (e.g. an installer under Program Files) fall back to the per-user data folder.
// An install that already has a database in the old per-user location keeps using it until the
// user picks a folder, so upgrading never hides existing data.
const DB_FILE_NAME = 'reqSpace.sqlite';

function isWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch { return false; }
}

function defaultDbDir() {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'));
  return isWritableDir(exeDir) ? exeDir : configDir;
}

function resolveDbDir(cfg) {
  if (cfg && cfg.dbDir) return cfg.dbDir;
  if (fs.existsSync(path.join(configDir, DB_FILE_NAME))) return configDir;
  return defaultDbDir();
}

function writeConfig(cfg) {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
}

// ── Start embedded local server (SQLite mode) ─────────────────────────────────
function startLocalServer(onReady) {
  const isDev = !app.isPackaged;
  const port = 3005;

  if (isDev) {
    // In dev mode the server is started externally; just use it
    onReady(`http://localhost:${port}`);
    return;
  }

  const sqliteDbPath = path.join(resolveDbDir(readConfig()), DB_FILE_NAME);
  const serverEntry = path.join(process.resourcesPath, 'server', 'dist', 'index.js');

  console.log('Starting local server:', serverEntry);
  console.log('SQLite path:', sqliteDbPath);

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      // Without this, process.execPath launches another Electron app instance
      // instead of running the server script as plain Node.
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      NODE_ENV: 'production',
      CLIENT_DIST_PATH: path.join(process.resourcesPath, 'client', 'dist'),
      DB_TYPE: 'sqlite',
      DB_STORAGE_PATH: sqliteDbPath,
      // Optional single-user mode: no sign-in, no network needed; the server only listens on loopback.
      REQSPACE_OFFLINE: (readConfig() || {}).offline ? 'true' : 'false',
    },
  });

  // onReady must fire exactly once — firing it again after the window has
  // already loaded reloads the app out from under the user.
  let readyFired = false;
  const fireReady = () => {
    if (readyFired) return;
    readyFired = true;
    clearTimeout(fallbackTimer);
    onReady(`http://localhost:${port}`);
  };

  serverProcess.stdout.on('data', (d) => {
    const msg = d.toString();
    console.log('[server]', msg.trim());
    if (msg.includes('Server running')) {
      fireReady();
    }
  });

  serverProcess.stderr.on('data', (d) => {
    console.error('[server-err]', d.toString().trim());
  });

  // Fallback: load anyway if we missed the ready message
  const fallbackTimer = setTimeout(fireReady, 8000);
}

// ── Create main window ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // This window can be pointed at an arbitrary remote server URL, so it
      // must not have Node access: a compromised or hostile server would
      // otherwise get code execution on the user's machine.
      preload: path.join(__dirname, 'preload.js'),
      // Test hook (tests/e2e/electron-target.ts): launching with --e2e-web-transport hides the desktop
      // HTTP bridge so UI specs that mock servers with page.route use the browser transport.
      additionalArguments: process.argv.includes('--e2e-web-transport') ? ['--e2e-web-transport'] : [],
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: 'reqSpace',
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url)) return;
    event.preventDefault();
    isConfiguredCustomIdp(url).then((isIdp) => {
      if (isIdp && mainWindow) mainWindow.loadURL(url);
      else openExternally(url);
    });
  });

  const savedConfig = readConfig();

  if (savedConfig) {
    // Already configured — go straight to the app
    launchApp(savedConfig);
  } else {
    // First run — show setup screen
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));

    ipcMain.once('setup-choice', (_event, choice) => {
      writeConfig(choice);
      buildMenu();
      launchApp(choice);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Database folder / offline mode (setup screen + File menu) ────────────────
ipcMain.handle('reqspace:pick-db-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose where reqSpace keeps its database',
    defaultPath: resolveDbDir(readConfig()),
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled || !res.filePaths[0] ? null : res.filePaths[0];
});
ipcMain.handle('reqspace:default-db-dir', () => defaultDbDir());

async function changeDbFolder() {
  const cfg = readConfig();
  if (!cfg || cfg.mode !== 'local') {
    dialog.showMessageBox(mainWindow, { type: 'info', message: 'The database folder only applies to Local mode.' });
    return;
  }
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose where reqSpace keeps its database',
    defaultPath: resolveDbDir(cfg),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || !picked.filePaths[0]) return;
  const from = path.join(resolveDbDir(cfg), DB_FILE_NAME);
  const to = path.join(picked.filePaths[0], DB_FILE_NAME);
  if (path.resolve(from) === path.resolve(to)) return;
  if (!isWritableDir(picked.filePaths[0])) {
    dialog.showErrorBox('reqSpace', 'That folder is not writable.');
    return;
  }
  // Stop the server so the file is not in use, then bring the data along if the target has none.
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
  try {
    if (!fs.existsSync(to) && fs.existsSync(from)) fs.copyFileSync(from, to);
  } catch (e) {
    dialog.showErrorBox('reqSpace', 'Could not copy the database: ' + e.message);
    app.relaunch(); app.exit(0);
    return;
  }
  writeConfig({ ...cfg, dbDir: picked.filePaths[0] });
  app.relaunch();
  app.exit(0);
}

function toggleOffline() {
  const cfg = readConfig();
  if (!cfg || cfg.mode !== 'local') {
    dialog.showMessageBox(mainWindow, { type: 'info', message: 'Offline mode only applies to Local mode.' });
    return;
  }
  writeConfig({ ...cfg, offline: !cfg.offline });
  app.relaunch();
  app.exit(0);
}

function buildMenu() {
  const cfg = readConfig() || {};
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Database location…', click: changeDbFolder },
        { label: 'Offline mode (skip sign-in)', type: 'checkbox', checked: !!cfg.offline, click: toggleOffline },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));
}

// ── Launch the app based on config ───────────────────────────────────────────
function launchApp(config) {
  if (config.mode === 'local') {
    // Show loading screen while server starts
    mainWindow.loadFile(path.join(__dirname, 'loading.html')).catch(() => {});
    startLocalServer((url) => {
      if (mainWindow) mainWindow.loadURL(url);
    });
  } else {
    // Remote server
    mainWindow.loadURL(config.url);
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
// Desktop transport: requests run in Node so they get client certificates,
// proxy, verifySsl and no CORS restrictions. Aborts arrive by request id.
const inflightRequests = new Map();
ipcMain.handle('reqspace:send-request', async (_e, payload, requestId) => {
  const controller = new AbortController();
  if (requestId) inflightRequests.set(requestId, controller);
  try {
    return await nodeSendRequest(payload, { signal: controller.signal });
  } catch (err) {
    return { error: err && err.message ? err.message : String(err), canceled: !!(err && err.canceled) };
  } finally {
    if (requestId) inflightRequests.delete(requestId);
  }
});
ipcMain.on('reqspace:abort-request', (_e, requestId) => {
  const c = inflightRequests.get(requestId);
  if (c) c.abort();
});

app.whenReady().then(() => { buildMenu(); createWindow(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
