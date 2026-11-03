import fs from 'fs';
import path from 'path';

describe('CI admin env matches Playwright webServer', () => {
  const root = path.resolve(__dirname, '../../..');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/test.yml'), 'utf8');
  const playwright = fs.readFileSync(path.join(root, 'playwright.config.ts'), 'utf8');

  function startServerBlock(yml: string): string {
    const marker = '- name: Start server';
    const start = yml.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);
    const after = yml.slice(start);
    const nextStep = after.indexOf('\n      - name:', marker.length);
    return nextStep === -1 ? after : after.slice(0, nextStep);
  }

  it('starts the CI server with the same admin env as the local webServer', () => {
    const webServer = playwright.slice(playwright.indexOf('webServer:'));
    expect(webServer).toContain("NODE_ENV: 'test'");
    expect(webServer).toContain("ALLOW_DEFAULT_ADMIN: 'true'");
    expect(webServer).toContain("ADMIN_PASSWORD: 'admin'");

    const block = startServerBlock(workflow);
    expect(block).toMatch(/NODE_ENV=test\b|NODE_ENV:\s*test\b/);
    expect(block).toMatch(/ALLOW_DEFAULT_ADMIN=true\b|ALLOW_DEFAULT_ADMIN:\s*['"]?true\b/);
    expect(block).toMatch(/ADMIN_PASSWORD=admin\b|ADMIN_PASSWORD:\s*['"]?admin\b/);
    expect(block).not.toMatch(/NODE_ENV=development\b|NODE_ENV:\s*development\b/);
  });
});
