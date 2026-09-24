import { memoryStore, redisStore } from '../middleware/rateLimit';

describe('rate limit stores', () => {
  test('memory store counts inside one process', async () => {
    const store = memoryStore();
    const first = await store.hit('ip', 60_000);
    const second = await store.hit('ip', 60_000);
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
  });

  test('two redis stores share one counter', async () => {
    const keys = new Map<string, { count: number; expiresAt: number }>();
    const redis = {
      async incr(key: string) {
        const now = Date.now();
        const current = keys.get(key);
        const count = !current || current.expiresAt <= now ? 1 : current.count + 1;
        keys.set(key, { count, expiresAt: current && current.expiresAt > now ? current.expiresAt : now + 60_000 });
        return count;
      },
      async pttl(key: string) {
        const current = keys.get(key);
        if (!current) return -2;
        return Math.max(0, current.expiresAt - Date.now());
      },
      async pexpire(key: string, ms: number) {
        const current = keys.get(key);
        if (current) current.expiresAt = Date.now() + ms;
        return 1;
      },
    };
    const a = redisStore(redis);
    const b = redisStore(redis);
    expect((await a.hit('rl:proxy:1', 60_000)).count).toBe(1);
    expect((await b.hit('rl:proxy:1', 60_000)).count).toBe(2);
  });
});
