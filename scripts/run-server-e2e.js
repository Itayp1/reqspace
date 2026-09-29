// Runs the server's jest e2e suite (server/src/tests/*.e2e.test.ts) against a
// freshly started, freshly initialized server — the workflow the CI job
// follows manually. Locally, developers had no equivalent: `npm test --prefix
// server` alone expects a server to already be running somewhere, and if a
// stale one is still listening on the same port (wrong DB, wrong env, wrong
// code) the tests silently talk to it instead. This script always starts its
// own server and always tears it down, so a run is self-contained.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || '3005';
const DB_TYPE = process.env.DB_TYPE || 'sqlite';
const ROOT = path.resolve(__dirname, '..');

// A fresh, uniquely-named file per run — NOT ':memory:'. Sequelize's default
// connection pool opens multiple connections, and each ':memory:' connection
// gets its own private, empty database, so pooled queries can intermittently
// miss the seeded admin. A real file is shared correctly across connections.
const sqliteTestDbPath = path.join(os.tmpdir(), `reqspace-server-e2e-${Date.now()}.sqlite`);

// Keep this env in sync with the webServer entry in playwright.config.ts —
// both need the server to boot the same way for local runs to be trustworthy.
const SERVER_ENV = {
  ...process.env,
  NODE_ENV: 'test',
  MUTATION_RATE_LIMIT_MAX: process.env.MUTATION_RATE_LIMIT_MAX || '300',
  READ_RATE_LIMIT_MAX: process.env.READ_RATE_LIMIT_MAX || '2000',
  DB_TYPE,
  DB_STORAGE_PATH: sqliteTestDbPath,
  PORT,
  ALLOW_DEFAULT_ADMIN: 'true',
  ADMIN_PASSWORD: 'admin',
  CERT_ENCRYPTION_KEY:
    process.env.CERT_ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      const body = await res.json();
      if (res.status === 200 && body.status === 'ok') return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server did not become healthy on port ${PORT} within ${timeoutMs}ms`);
}

async function main() {
  console.log(`Wiping DB (DB_TYPE=${DB_TYPE})...`);
  await new Promise((resolve, reject) => {
    const wipe = spawn(process.execPath, [path.join(ROOT, 'scripts/wipe-db.js')], {
      cwd: ROOT,
      env: SERVER_ENV,
      stdio: 'inherit',
    });
    wipe.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`wipe-db exited ${code}`))));
  });

  console.log(`Starting server on port ${PORT}...`);
  const server = spawn('npm', ['run', 'dev', '--prefix', 'server'], {
    cwd: ROOT,
    env: SERVER_ENV,
    shell: true,
    detached: process.platform !== 'win32',
  });
  server.stdout?.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

  let exitCode = 1;
  try {
    await waitForHealth(60000);
    console.log('Server healthy — running jest e2e suite...');

    exitCode = await new Promise((resolve) => {
      const jest = spawn('npm', ['test', '--prefix', 'server'], {
        cwd: ROOT,
        env: { ...SERVER_ENV, TEST_PORT: PORT },
        shell: true,
        stdio: 'inherit',
      });
      jest.on('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    console.log('Shutting down server...');
    killTree(server);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
