import _ from 'lodash';
import moment from 'moment';
import CryptoJS from 'crypto-js';
import { expect } from 'chai';

type SendReply = { error?: string; status?: number; statusText?: string; headers?: Record<string, string>; body?: string };

const pending = new Map<string, (reply: SendReply) => void>();

function mapsFrom(record: Record<string, string> | undefined) {
  return { ...(record || {}) };
}

window.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data || event.source !== window.parent) return;
  if (data.type === 'sendRequestResult') {
    pending.get(data.requestId)?.(data);
    pending.delete(data.requestId);
    return;
  }
  if (data.type !== 'run') return;

  const executionId = data.executionId as string;
  const environment = mapsFrom(data.context?.environment);
  const globals = mapsFrom(data.context?.globals);
  const collection = mapsFrom(data.context?.collectionVariables);
  const locals = mapsFrom(data.context?.variables);
  const iterationData = data.context?.iterationData || {};
  const response = data.context?.response;
  const testResults: Array<{ name: string; passed: boolean; error?: string }> = [];
  let nextRequest: string | null | undefined;
  let visualizer: { template: string; data?: unknown } | undefined;
  const inflight: Promise<void>[] = [];

  const post = (payload: Record<string, unknown>) => {
    window.parent.postMessage({ ...payload, executionId }, '*');
  };

  const pm = {
    environment: {
      get: (key: string) => environment[key],
      set: (key: string, value: string) => {
        environment[key] = value;
        post({ type: 'mutation', scope: 'environment', key, value });
      },
    },
    globals: {
      get: (key: string) => globals[key],
      set: (key: string, value: string) => {
        globals[key] = value;
        post({ type: 'mutation', scope: 'globals', key, value });
      },
    },
    collectionVariables: {
      get: (key: string) => collection[key],
      set: (key: string, value: string) => {
        collection[key] = value;
        post({ type: 'mutation', scope: 'collection', key, value });
      },
    },
    iterationData: { get: (key: string) => iterationData[key] },
    variables: {
      get: (key: string) => locals[key] ?? iterationData[key] ?? environment[key] ?? collection[key] ?? globals[key],
      set: (key: string, value: string) => {
        locals[key] = value;
        post({ type: 'mutation', scope: 'variables', key, value });
      },
    },
    response: response
      ? {
          code: response.status,
          status: response.statusText,
          responseTime: response.time,
          headers: response.headers,
          json: () => response.json,
          text: () => response.body,
        }
      : undefined,
    visualizer: {
      set: (template: string, view?: unknown) => {
        visualizer = { template, data: view };
      },
    },
    test: (name: string, fn: () => void) => {
      try {
        fn();
        testResults.push({ name, passed: true });
      } catch (err: any) {
        testResults.push({ name, passed: false, error: err?.message || String(err) });
      }
    },
    expect,
    sendRequest: (urlOrConfig: any, cb?: (err: any, res: any) => void) => {
      const requestId = `${executionId}:${pending.size}:${Date.now()}`;
      const url = typeof urlOrConfig === 'string' ? urlOrConfig : urlOrConfig?.url;
      const method = (typeof urlOrConfig === 'object' && urlOrConfig?.method) || 'GET';
      const headers = (typeof urlOrConfig === 'object' && (urlOrConfig.header || urlOrConfig.headers)) || {};
      const body = typeof urlOrConfig === 'object' ? urlOrConfig.body : undefined;
      inflight.push(new Promise((resolve) => {
        pending.set(requestId, (reply) => {
          try {
            if (reply.error) cb?.(new Error(reply.error), null);
            else cb?.(null, {
              status: reply.status,
              statusText: reply.statusText,
              headers: reply.headers,
              body: reply.body,
              json: () => {
                try { return JSON.parse(reply.body || ''); } catch { return reply.body; }
              },
            });
          } finally {
            resolve();
          }
        });
      }));
      post({ type: 'sendRequest', requestId, req: { method, url, headers, body } });
    },
  };

  const reqSpace = {
    setNextRequest: (value: string | null) => {
      nextRequest = value;
    },
  };

  const consoleMock = {
    log: (...args: unknown[]) => post({ type: 'log', level: 'log', message: args.map(String).join(' ') }),
    info: (...args: unknown[]) => post({ type: 'log', level: 'log', message: args.map(String).join(' ') }),
    warn: (...args: unknown[]) => post({ type: 'log', level: 'warn', message: args.map(String).join(' ') }),
    error: (...args: unknown[]) => post({ type: 'log', level: 'error', message: args.map(String).join(' ') }),
  };

  try {
    const fn = new Function('pm', 'reqSpace', '_', 'moment', 'CryptoJS', 'console', data.code);
    fn(pm, reqSpace, _, moment, CryptoJS, consoleMock);
    let guard = 0;
    while (inflight.length && guard++ < 20) {
      const batch = inflight.splice(0);
      await Promise.all(batch);
    }
    post({ type: 'done', testResults, nextRequest, visualizer });
  } catch (err: any) {
    post({ type: 'error', error: err?.message || String(err), testResults, nextRequest, visualizer });
  }
});
