import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Reporter = typeof import('./errorReporter');

let reporter: Reporter;
let fetchMock: ReturnType<typeof vi.fn>;

function sentBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn(() => Promise.resolve({ status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  reporter = await import('./errorReporter');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reportClientError', () => {
  it('posts only the allowed fields to /api/errors', () => {
    reporter.reportClientError({
      kind: 'api',
      message: 'Network Error',
      route: '/api/collections',
      method: 'GET',
      status: 502,
      stack: 'Error\n    at a',
      ...({ password: 'leak-me' } as object),
    } as Parameters<Reporter['reportClientError']>[0]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/errors');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(sentBodies()[0]).toEqual({
      kind: 'api',
      message: 'Network Error',
      stack: 'Error\n    at a',
      route: '/api/collections',
      method: 'GET',
      status: 502,
    });
  });

  it('suppresses an identical fault within the dedupe window', () => {
    const report = { kind: 'window.error' as const, message: 'same fault', stack: 'Error\n    at x' };
    reporter.reportClientError(report);
    reporter.reportClientError(report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the benign ResizeObserver loop message', () => {
    reporter.reportClientError({ kind: 'window.error', message: 'ResizeObserver loop completed with undelivered notifications.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops after 100 reports on one page', () => {
    for (let i = 0; i < 150; i++) {
      reporter.reportClientError({ kind: 'api', message: `unique fault ${i}` });
    }
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });

  it('does not throw or reject when the network call fails', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    expect(() => reporter.reportClientError({ kind: 'api', message: 'while offline' })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('installGlobalErrorHandlers', () => {
  it('reports uncaught window errors', () => {
    reporter.installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { message: 'kaboom', error: new Error('kaboom') }));
    expect(sentBodies()[0]).toMatchObject({ kind: 'window.error', message: 'kaboom' });
  });
});
