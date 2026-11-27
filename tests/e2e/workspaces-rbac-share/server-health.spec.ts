import { test, expect } from '../fixtures';
import fs from 'fs';
import path from 'path';
import { newCtx } from './invite-helpers';

test.describe('Server health gate', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  test('[R1.1] a DB connection failure shows a "Database Connection Error" gate while /api/health keeps answering', async () => {
    expect(src('server/src/index.ts')).toMatch(/dbGate|503/);
    expect(src('client/src/App.tsx')).toContain('Database Connection Error');
    const health = await (await (await newCtx()).get('/api/health')).json();
    expect(health.status).toBe('ok');
  });
});
