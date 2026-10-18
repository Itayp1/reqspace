// Runs the whole Playwright suite in the browser AND inside the Electron app, at the same time,
// then re-checks every failure on its own so you only have to look at the real ones.
//
// Usage: node scripts/run-e2e-targets.js [--electron-only|--browser-only] [--sequential]
//          [--shards=N|auto] [--no-recheck] [playwright args...]
//
// Each target gets its own isolated stack so the runs cannot collide:
//   - its own API + client ports (free ports picked from the OS)
//   - its own empty SQLite database (a unique temp file, deleted afterwards - NOT ':memory:':
//     Sequelize's connection pool gives every connection a private empty ':memory:' database,
//     which breaks login; a throw-away file behaves identically but is shared across the pool)
//   - its own output folder (test-results-<run>) and HTML report (playwright-report-<run>)
//   --shards=N|auto splits each target's files over N parallel runs, each with its own stack.
//
// Re-check: running many stacks at once makes timing-sensitive tests fail that pass on an idle
// machine. Every file with a failure is therefore run again, alone, on a fresh stack:
//   passes when re-run  -> FLAKY (load/timing), reported but does not fail the run
// Tests that only passed on Playwright's own automatic retry are listed as FLAKY too.
//   fails again         -> REAL failure, printed with its first error line, exit code 1
// Output is prefixed [browser] / [electron] / [<target>:recheck].
const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const only = args.includes('--electron-only') ? 'electron' : args.includes('--browser-only') ? 'browser' : null;
const sequential = args.includes('--sequential');
const recheck = !args.includes('--no-recheck');
const shardsArg = args.find((a) => a.startsWith('--shards='));
const cpuShards = Math.min(4, Math.max(2, Math.floor(os.cpus().length / 4)));
const shardsValue = shardsArg ? shardsArg.split('=')[1] : '1';
const shards = shardsValue === 'auto' ? cpuShards : Math.max(1, parseInt(shardsValue, 10) || 1);
// This script owns the reporters (it needs the JSON one), so a caller's --reporter is dropped.
const extra = args.filter((a) =>
  !['--electron-only', '--browser-only', '--sequential', '--no-recheck'].includes(a) && a !== shardsArg && !a.startsWith('--reporter'));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function prefixLines(stream, label, sink) {
  let buf = '';
  stream.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const l of lines) sink.write(`[${label}] ${l}\n`);
  });
  stream.on('end', () => { if (buf) sink.write(`[${label}] ${buf}\n`); });
}

const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');

// From a Playwright JSON report: tests whose final status is "unexpected" (failed / timed out), and tests
// that failed and then passed on Playwright's own automatic retry ("flaky").
function readFailures(jsonFile) {
  let report;
  try { report = JSON.parse(fs.readFileSync(jsonFile, 'utf8')); } catch { return { failures: [], retried: [] }; }
  const out = [];
  const retried = [];
  const walk = (suite, titles) => {
    const here = suite.title && !/\.spec\.ts$/.test(suite.title) ? [...titles, suite.title] : titles;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        if (t.status !== 'unexpected' && t.status !== 'flaky') continue;
        const failedRun = (t.results || []).find((r) => r.status !== 'passed' && r.status !== 'skipped') || {};
        const msg = stripAnsi(failedRun.error && failedRun.error.message).split('\n').map((l) => l.trim()).filter(Boolean)[0] || 'no error message';
        const item = { file: spec.file, title: [...here, spec.title].join(' › '), error: msg.slice(0, 200) };
        (t.status === 'flaky' ? retried : out).push(item);
      }
    }
    for (const s of suite.suites || []) walk(s, here);
  };
  for (const s of report.suites || []) walk(s, []);
  return { failures: out, retried };
}

// One Playwright process on its own stack. `files` replaces the caller's spec filters (re-check).
async function runTarget(name, label, suffix, { shard, files } = {}) {
  const [port, clientPort] = [await freePort(), await freePort()];
  const stamp = `${Date.now()}-${process.pid}`;
  const dbPath = path.join(os.tmpdir(), `reqspace-e2e-${suffix}-${stamp}.sqlite`);
  const jsonFile = path.join(os.tmpdir(), `reqspace-e2e-${suffix}-${stamp}.json`);
  const env = {
    ...process.env,
    REQSPACE_TARGET: name,
    PORT: String(port),
    CLIENT_PORT: String(clientPort),
    REQSPACE_E2E_DB_PATH: dbPath,
    REQSPACE_RESULTS_DIR: `test-results-${suffix}`,
    PLAYWRIGHT_HTML_REPORT: `playwright-report-${suffix}`,
    PLAYWRIGHT_HTML_OPEN: 'never',
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
  };
  delete env.REQSPACE_API_URL; // derived from PORT by playwright.config.ts
  console.log(`[${label}] api :${port}  client :${clientPort}  db ${dbPath}`);
  const pwArgs = files
    ? ['--workers=1', '--retries=0', ...files]
    : [...extra, ...(shard ? [`--shard=${shard.i}/${shard.n}`] : [])];
  const child = spawn('npx', ['playwright', 'test', '--reporter=list,json,html', ...pwArgs], { shell: true, env });
  prefixLines(child.stdout, label, process.stdout);
  prefixLines(child.stderr, label, process.stderr);
  const code = await new Promise((resolve) => child.on('close', resolve));
  for (const s of ['', '-wal', '-shm', '-journal']) fs.rmSync(dbPath + s, { force: true });
  const { failures, retried } = readFailures(jsonFile);
  fs.rmSync(jsonFile, { force: true });
  return { code, failures, retried };
}

(async () => {
  const targets = ['browser', 'electron'].filter((t) => !only || t === only);
  const jobs = targets.flatMap((t) => Array.from({ length: shards }, (_, i) => ({ t, i: i + 1 })));
  const run = (j) => runTarget(
    j.t,
    shards > 1 ? `${j.t}:${j.i}/${shards}` : j.t,
    shards > 1 ? `${j.t}-${j.i}` : j.t,
    shards > 1 ? { shard: { i: j.i, n: shards } } : {},
  );
  const results = sequential
    ? await jobs.reduce(async (acc, j) => [...(await acc), await run(j)], Promise.resolve([]))
    : await Promise.all(jobs.map(run));

  const real = [];
  const flaky = [];
  let unexplained = false; // a job failed but produced no parsable failures (crash, config error)
  for (const t of targets) {
    const mine = results.filter((_, i) => jobs[i].t === t);
    const failures = mine.flatMap((r) => r.failures);
    mine.flatMap((r) => r.retried).forEach((f) => flaky.push({ target: t, ...f, how: 'passed on automatic retry' }));
    if (mine.some((r) => r.code !== 0 && r.failures.length === 0)) unexplained = true;
    if (!failures.length) continue;
    if (!recheck) { failures.forEach((f) => real.push({ target: t, ...f })); continue; }
    const files = [...new Set(failures.map((f) => f.file))].map((f) => `tests/e2e/${f.replace(/\\/g, '/')}`);
    console.log(`\n===== re-checking ${failures.length} failed test(s) of ${t} alone, in ${files.length} file(s) =====`);
    const again = await runTarget(t, `${t}:recheck`, `${t}-recheck`, { files });
    const stillFailing = new Map(again.failures.map((f) => [`${f.file}::${f.title}`, f]));
    for (const f of failures) {
      const key = `${f.file}::${f.title}`;
      if (stillFailing.has(key)) real.push({ target: t, ...f, error: stillFailing.get(key).error });
      else flaky.push({ target: t, ...f, how: 'passed when run alone' });
    }
  }

  console.log('\n================ SUMMARY ================');
  if (flaky.length) {
    console.log(`\nFLAKY - failed under load, then passed (${flaky.length}):`);
    for (const f of flaky) console.log(`  [${f.target}] ${f.file} › ${f.title}\n      first failure (${f.how}): ${f.error}`);
  }
  if (real.length) {
    console.log(`\nREAL FAILURES - failed again when run alone (${real.length}):`);
    for (const f of real) console.log(`  [${f.target}] ${f.file} › ${f.title}\n      ${f.error}`);
  }
  if (unexplained) console.log('\nA run exited with an error but reported no failed tests (crash or configuration error) - see its output above.');
  if (!real.length && !unexplained) console.log(flaky.length ? '\nNo real failures.' : '\nAll targets passed.');
  process.exit(real.length || unexplained ? 1 : 0);
})();
