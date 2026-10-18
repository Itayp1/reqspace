import { test, expect } from './fixtures';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * R6.6 (finding 192): the production bundle shipped Monaco inside the entry chunk
 * (4.8MB entry, 14.4MB total JS). The initial load (scripts + modulepreloads
 * referenced by index.html) must stay within a budget; Monaco is lazy-loaded.
 */
const ROOT = path.join(__dirname, '..', '..');
const INITIAL_JS_BUDGET = 2 * 1024 * 1024; // 2MB uncompressed

test('[R6.6] initial JS (entry + preloads) stays under budget; Monaco is code-split', async () => {
  test.setTimeout(600_000);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'reqspace-r66-'));
  try {
    execSync(`npx vite build --outDir "${out}" --emptyOutDir`, {
      cwd: path.join(ROOT, 'client'),
      stdio: 'pipe',
      timeout: 540_000,
    });
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const refs = new Set<string>();
    for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\.js)"/g)) refs.add(m[1]);
    expect(refs.size).toBeGreaterThan(0);
    let total = 0;
    for (const r of refs) total += fs.statSync(path.join(out, r)).size;
    expect(total, `initial JS ${(total / 1048576).toFixed(2)}MB`).toBeLessThan(INITIAL_JS_BUDGET);
    // Monaco must live in a separate, non-initial chunk.
    const assets = fs.readdirSync(path.join(out, 'assets'));
    expect(assets.some((f) => /^monacoEditorImpl-.*\.js$/.test(f))).toBe(true);
    for (const r of refs) expect(path.basename(r)).not.toMatch(/monaco|editor\.api/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
