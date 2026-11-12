import fs from 'fs';
import path from 'path';

describe('CI server env matches Playwright webServer', () => {
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

  // The server never seeds an admin: the suites create one through first-run setup, and
  // the API answers 503 until JWT_SECRET is set, so both servers need a test secret.
  it('starts the CI server like the local webServer: test mode, a JWT secret, no seeded admin', () => {
    const webServer = playwright.slice(playwright.indexOf('webServer:'));
    expect(webServer).toContain("NODE_ENV: 'test'");
    expect(webServer).toContain('JWT_SECRET:');
    expect(webServer).not.toMatch(/ADMIN_PASSWORD|ALLOW_DEFAULT_ADMIN/);

    const block = startServerBlock(workflow);
    expect(block).toMatch(/NODE_ENV=test\b|NODE_ENV:\s*test\b/);
    expect(block).toMatch(/JWT_SECRET=|JWT_SECRET:/);
    expect(block).not.toMatch(/ADMIN_PASSWORD|ALLOW_DEFAULT_ADMIN/);
    expect(block).not.toMatch(/NODE_ENV=development\b|NODE_ENV:\s*development\b/);
  });
});
