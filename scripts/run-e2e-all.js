// Full browser run in two phases: the regular suite (rate limiters off), then the @ratelimit
// specs last on a fresh server with the limiters on. Extra args go to the first phase only.
//   node scripts/run-e2e-all.js [playwright args...]
const { spawnSync } = require('child_process');

function run(label, args, env) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync('npx', ['playwright', 'test', ...args], {
    stdio: 'inherit', shell: true, env: { ...process.env, ...env },
  });
  return r.status ?? 1;
}

const main = run('regular suite', process.argv.slice(2), {});
const limits = run('@ratelimit (limiters on)', ['-g', '@ratelimit'], { DISABLE_RATE_LIMIT: 'false' });
process.exit(main || limits);
