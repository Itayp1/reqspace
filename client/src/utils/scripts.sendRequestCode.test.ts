import { describe, it, expect, vi } from 'vitest';

const { sendRequest, captured } = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  captured: {
    code: undefined as number | undefined,
    status: undefined as number | undefined,
  },
}));

vi.mock('../sandbox/worker?worker', () => {
  return {
    default: class SandboxWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage(msg: { type?: string; response?: { code?: number; status?: number } }) {
        if (msg?.type === 'sendRequestResult') {
          captured.code = msg.response?.code;
          captured.status = msg.response?.status;
          this.onmessage?.({ data: { type: 'result', testResults: [] } });
          return;
        }
        this.onmessage?.({
          data: {
            type: 'sendRequest',
            id: 'req-1',
            request: { url: 'https://example.test/created', method: 'GET' },
          },
        });
      }
      terminate() {}
    },
  };
});

vi.mock('../transport', () => ({
  sendRequest,
}));

vi.mock('../store/consoleStore', () => ({
  useConsoleStore: { getState: () => ({ addLog: vi.fn() }) },
}));

vi.mock('../store/environmentStore', () => ({
  useEnvironmentStore: {
    getState: () => ({
      environments: [],
      activeEnvironmentId: null,
      globalEnvironment: null,
      localVariables: [],
    }),
  },
}));

vi.mock('../store/collectionStore', () => ({
  useCollectionStore: { getState: () => ({ collections: [] }) },
}));

import { runPreRequestScript } from './scripts';

describe('pm.sendRequest response mapping', () => {
  it('sends response.code and response.status from the transport status', async () => {
    sendRequest.mockResolvedValue({
      status: 201,
      statusText: 'Created',
      headers: {},
      body: '',
      isBase64: false,
      responseTime: 1,
      size: 0,
    });

    await runPreRequestScript('pm.sendRequest("https://example.test/created")');

    expect(captured.code).toBe(201);
    expect(captured.status).toBe(201);
  });
});
