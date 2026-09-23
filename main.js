const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

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

  const sqliteDbPath = path.join(configDir, 'reqSpace.sqlite');
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
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: 'reqSpace',
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
      launchApp(choice);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
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
app.whenReady().then(createWindow);

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
