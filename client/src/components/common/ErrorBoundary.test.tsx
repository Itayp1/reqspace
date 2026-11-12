import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): never {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the fallback and reports the render error with its component stack', async () => {
    await act(async () => {
      root.render(createElement(ErrorBoundary, null, createElement(Boom)));
    });

    expect(container.textContent).toContain('Something went wrong.');
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ kind: 'react-boundary', message: 'render exploded' });
    expect(body.componentStack).toBeTruthy();
  });
});
