import api from '../api/axios';

export interface ScriptOutcome {
  testResults: Array<{ name: string; passed: boolean; error?: string }>;
  nextRequest?: string | null;
  visualizerData?: { template: string; data?: any };
  mutations: Array<{ scope: string; key: string; value: string }>;
  logs: Array<{ level: string; args: any[] }>;
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

export function executeInSandbox(code: string, context: Record<string, unknown>): Promise<ScriptOutcome> {
  if (!code.trim()) {
    return Promise.resolve({ testResults: [], mutations: [], logs: [] });
  }
  const executionId = Math.random().toString(36).slice(2);
  const w = getWorker();
  return new Promise((resolve) => {
    const outcome: ScriptOutcome = { testResults: [], mutations: [], logs: [] };
    const timer = window.setTimeout(() => {
      w.removeEventListener('message', onMessage);
      resolve(outcome);
    }, 10_000);

    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || msg.executionId !== executionId) return;
      if (msg.type === 'sendRequest') {
        const target = typeof msg.req === 'string' ? { url: msg.req, method: 'GET' } : (msg.req || {});
        api.post('/proxy', { method: target.method || 'GET', url: target.url, headers: target.headers || {}, body: target.body }).then((res) => {
          w.postMessage({ type: 'sendRequestResult', executionId, requestId: msg.requestId, response: { code: res.data.status, json: () => JSON.parse(res.data.body), text: () => res.data.body } });
        }).catch((err) => {
          w.postMessage({ type: 'sendRequestResult', executionId, requestId: msg.requestId, error: err?.message || 'sendRequest failed' });
        });
      }
      if (msg.type === 'log') outcome.logs.push({ level: msg.level, args: msg.args });
      if (msg.type === 'mutation') outcome.mutations.push({ scope: msg.scope, key: msg.key, value: msg.value });
      if (msg.type === 'visualizer') outcome.visualizerData = { template: msg.template, data: msg.data };
      if (msg.type === 'nextRequest') outcome.nextRequest = msg.value;
      if (msg.type === 'done') {
        outcome.testResults = msg.testResults || [];
        window.clearTimeout(timer);
        w.removeEventListener('message', onMessage);
        resolve(outcome);
      }
      if (msg.type === 'error') {
        outcome.testResults.push({ name: 'Script Execution', passed: false, error: msg.error });
        window.clearTimeout(timer);
        w.removeEventListener('message', onMessage);
        resolve(outcome);
      }
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ code, context, executionId });
  });
}
