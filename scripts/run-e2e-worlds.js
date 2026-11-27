// Runs the browser e2e suite as parallel "world groups", each on its own isolated stack
// (own API + client ports, own temp SQLite DB, own results folder). See docs/plans/e2e-worlds.md.
//
// Usage: node scripts/run-e2e-worlds.js [--only=a,b] [playwright args...]
//   --only=a,b   run just those groups (names below)
// Groups are balanced by test count (~120-155 each), then a serial `perf` phase runs the latency tests; every world keeps its own folder under tests/e2e/.
const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');

const GROUPS = {
  a: ['requests', 'history-search', 'runner', 'import-export'],
  b: ['platform', 'scripts', 'realtime', 'ui'],
  c: ['admin', 'auth', 'oauth', 'first-run'], // global-settings worlds: safe because every group has its own DB
  d: ['workspaces-rbac-share', 'collections-tree', 'variables-environments'],
};
// Latency-budget tests (seeded-perf, the API <100ms check) fail when other stacks load the CPU, so they
// are skipped in the parallel groups and run alone afterwards on a quiet machine.
const PERF = 'seeded perf|API performance';

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',') : Object.keys(GROUPS);
const extra = args.filter((a) => a !== onlyArg && !a.startsWith('--reporter'));
const unknown = only.filter((g) => !GROUPS[g]);
if (unknown.length) { console.error(`unknown group(s): ${unknown.join(', ')}`); process.exit(2); }

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

function prefix(stream, label, out) {
  let buf = '';
  stream.on('data', (d) => {
    buf += d;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const l of lines) if (l.trim() && !/NO_COLOR|trace-warnings/.test(l)) out.write(`[${label}] ${l}\n`);
  });
}

async function runGroup(name, { folders, grep } = {}) {
  const [port, clientPort] = [await freePort(), await freePort()];
  const stamp = `${Date.now()}-${process.pid}-${name}`;
  const dbPath = path.join(os.tmpdir(), `reqspace-e2e-world-${stamp}.sqlite`);
  const env = {
    ...process.env,
    PORT: String(port),
    CLIENT_PORT: String(clientPort),
    REQSPACE_E2E_DB_PATH: dbPath,
    REQSPACE_RESULTS_DIR: `test-results-world-${name}`,
    PLAYWRIGHT_HTML_OPEN: 'never',
  };
  delete env.REQSPACE_API_URL; // derived from PORT by playwright.config.ts
  delete env.REQSPACE_WEB_URL;
  folders ??= GROUPS[name].map((w) => `tests/e2e/${w}/`);
  console.log(`[${name}] ${folders.join(', ')}  api :${port}  client :${clientPort}`);
  const child = spawn('pnpm', ['exec', 'playwright', 'test', '--reporter=line', ...(grep ? ['--grep', `"${grep}"`] : ['--grep-invert', `"${PERF}"`]), ...extra, ...folders], { shell: true, env });
  prefix(child.stdout, name, process.stdout);
  prefix(child.stderr, name, process.stderr);
  const code = await new Promise((resolve) => child.on('close', resolve));
  for (const s of ['', '-wal', '-shm', '-journal']) fs.rmSync(dbPath + s, { force: true });
  return { name, code };
}

(async () => {
  const t0 = Date.now();
  const results = await Promise.all(only.map((g) => runGroup(g)));
  if (!onlyArg || only.includes('b')) results.push(await runGroup('perf', { folders: ['tests/e2e/platform/'], grep: PERF }));
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nworlds finished in ${mins} min`);
  for (const r of results) console.log(`  ${r.name}: ${r.code === 0 ? 'passed' : `FAILED (exit ${r.code}, see test-results-world-${r.name})`}`);
  process.exit(results.every((r) => r.code === 0) ? 0 : 1);
})();
