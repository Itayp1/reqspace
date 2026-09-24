import { test } from '@playwright/test';

/** Origin for the active Playwright project, else PLAYWRIGHT_BASE_URL, else localhost:3005. */
export function serverOrigin(): string {
  try {
    const fromProject = test.info().project.use.baseURL;
    if (typeof fromProject === 'string' && fromProject) return fromProject;
  } catch {
    // global-setup has no running test
  }
  return process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005';
}

/** Used by global-setup, which runs before any project test. */
export const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005';
