import { cacheSize, invalidate, remember } from '../cache';

describe('request-path cache', () => {
  test('remember loads once until the key is invalidated', async () => {
    let loads = 0;
    const load = async () => {
      loads += 1;
      return 'editor';
    };
    expect(await remember('role:ws-1:user-1', load)).toBe('editor');
    expect(await remember('role:ws-1:user-1', load)).toBe('editor');
    expect(loads).toBe(1);

    invalidate('role:ws-1:');
    expect(await remember('role:ws-1:user-1', load)).toBe('editor');
    expect(loads).toBe(2);
    expect(cacheSize()).toBeGreaterThan(0);
  });

  test('a workspace prefix does not drop another workspace', async () => {
    await remember('role:ws-a:user', async () => 'owner');
    await remember('role:ws-b:user', async () => 'viewer');
    const before = cacheSize();
    invalidate('role:ws-a:');
    expect(cacheSize()).toBe(before - 1);
    let loads = 0;
    await remember('role:ws-b:user', async () => {
      loads += 1;
      return 'viewer';
    });
    expect(loads).toBe(0);
  });
});
