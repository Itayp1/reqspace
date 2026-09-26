import { execSync } from 'child_process';

// CLEAN-8: scratch patch_*.js files were committed under server/ because
// .gitignore anchored the pattern to the repo root (`/patch_*.js`), which
// only matches root-level files and lets anything nested under server/ or
// client/ slip through.
describe('CLEAN-8: no scratch patch_*.js files tracked in git', () => {
  const repoRoot = execSync('git rev-parse --show-toplevel').toString().trim();

  it('git ls-files has no patch_*.js or .bak files anywhere in the tree', () => {
    const files = execSync('git ls-files', { cwd: repoRoot }).toString().split('\n');
    const scratch = files.filter(f => /(^|\/)patch_.*\.js$/.test(f) || f.endsWith('.bak'));
    expect(scratch).toEqual([]);
  });

  it('.gitignore ignores patch_*.js at any depth, not just the repo root', () => {
    const nested = execSync('git check-ignore server/patch_probe_test.js', { cwd: repoRoot })
      .toString()
      .trim();
    expect(nested).toBe('server/patch_probe_test.js');
  });
});
