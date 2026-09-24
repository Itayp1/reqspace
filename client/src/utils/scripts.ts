import { useEnvironmentStore } from '../store/environmentStore';
import { useCollectionStore } from '../store/collectionStore';
import { useConsoleStore } from '../store/consoleStore';
import api from '../api/axios';

const SCRIPT_TIMEOUT_MS = 10_000;

type ScriptResult = {
  testResults: Array<{ name: string; passed: boolean; error?: string }>;
  visualizerData?: { template: string; data?: unknown };
  nextRequest?: string | null;
  error?: string;
};

function snapshotContext(collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  const { environments, activeEnvironmentId, globalEnvironment } = useEnvironmentStore.getState();
  const activeEnv = environments.find(e => e._id === activeEnvironmentId);
  const environment: Record<string, string> = {};
  activeEnv?.variables.forEach(v => { if (v.enabled !== false) environment[v.key] = v.currentValue; });
  const globals: Record<string, string> = {};
  globalEnvironment?.variables.forEach(v => { if (v.enabled !== false) globals[v.key] = v.currentValue; });
  const collectionVariables: Record<string, string> = {};
  if (collectionId) {
    const col = useCollectionStore.getState().collections.find(c => c._id === collectionId);
    col?.variables?.forEach(v => { if (v.enabled !== false) collectionVariables[v.key] = v.value; });
  }
  const variables: Record<string, string> = {};
  localVariables.forEach((value, key) => { variables[key] = value; });
  return { environment, globals, collectionVariables, variables, iterationData: iterationData || {} };
}

function applyMutation(scope: string, key: string, value: string, collectionId: string | undefined, localVariables: Map<string, string>) {
  if (scope === 'variables') {
    localVariables.set(key, value);
    return;
  }
  if (scope === 'environment') {
    const { environments, activeEnvironmentId, setEnvironments } = useEnvironmentStore.getState();
    const activeEnv = environments.find(e => e._id === activeEnvironmentId);
    if (!activeEnv) return;
    const existing = activeEnv.variables.find(v => v.key === key);
    const newVars = existing
      ? activeEnv.variables.map(v => v.key === key ? { ...v, currentValue: value } : v)
      : [...activeEnv.variables, { key, initialValue: value, currentValue: value, isSecret: false, enabled: true }];
    setEnvironments(environments.map(e => e._id === activeEnv._id ? { ...e, variables: newVars } : e));
    return;
  }
  if (scope === 'globals') {
    const { globalEnvironment, setGlobalEnvironment } = useEnvironmentStore.getState();
    if (!globalEnvironment) return;
    const existing = globalEnvironment.variables.find(v => v.key === key);
    const newVars = existing
      ? globalEnvironment.variables.map(v => v.key === key ? { ...v, currentValue: value } : v)
      : [...globalEnvironment.variables, { key, initialValue: value, currentValue: value, isSecret: false, enabled: true }];
    setGlobalEnvironment({ ...globalEnvironment, variables: newVars });
    return;
  }
  if (scope === 'collection' && collectionId) {
    const { collections, setCollections } = useCollectionStore.getState();
    const col = collections.find(c => c._id === collectionId);
    if (!col) return;
    const vars = col.variables || [];
    const existing = vars.find(v => v.key === key);
    const newVars = existing
      ? vars.map(v => v.key === key ? { ...v, value } : v)
      : [...vars, { key, value, enabled: true }];
    setCollections(collections.map(c => c._id === collectionId ? { ...c, variables: newVars } : c));
  }
}

function logLine(level: string, message: string) {
  const type = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  useConsoleStore.getState().addLog({ type, message });
}

/** Only these fields are forwarded to the proxy. The sandbox never receives the app axios instance. */
async function proxyFromScript(req: { method?: string; url?: string; headers?: Record<string, unknown>; body?: unknown }) {
  const url = typeof req?.url === 'string' ? req.url : '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('pm.sendRequest requires an absolute http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('pm.sendRequest only allows http and https URLs');
  }
  const headers: Record<string, string> = {};
  if (req.headers && typeof req.headers === 'object') {
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
  }
  const method = typeof req.method === 'string' ? req.method : 'GET';
  const res = await api.post('/proxy', { method, url, headers, body: req.body });
  const body = typeof res.data?.body === 'string' ? res.data.body : JSON.stringify(res.data?.body ?? '');
  return {
    status: res.data?.status || res.status,
    statusText: res.data?.statusText || res.statusText,
    headers: res.data?.headers || {},
    body,
  };
}

function runInSandbox(code: string, context: Record<string, unknown>, collectionId: string | undefined, localVariables: Map<string, string>): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const executionId = `script-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    iframe.src = '/sandbox.html';
    iframe.setAttribute('style', 'display:none');
    iframe.title = 'script sandbox';
    let settled = false;
    const finish = (result: ScriptResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      resolve(result);
    };
    const timer = window.setTimeout(() => {
      finish({ testResults: [{ name: 'Script Execution', passed: false, error: 'Script timed out' }], error: 'Script timed out' });
    }, SCRIPT_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.executionId !== executionId) return;
      if (data.type === 'log') logLine(data.level, String(data.message ?? ''));
      if (data.type === 'mutation') applyMutation(data.scope, String(data.key), String(data.value), collectionId, localVariables);
      if (data.type === 'sendRequest') {
        proxyFromScript(data.req || {})
          .then((response) => iframe.contentWindow?.postMessage({ type: 'sendRequestResult', requestId: data.requestId, ...response }, '*'))
          .catch((err: any) => iframe.contentWindow?.postMessage({ type: 'sendRequestResult', requestId: data.requestId, error: err?.message || String(err) }, '*'));
      }
      if (data.type === 'done') {
        finish({ testResults: data.testResults || [], visualizerData: data.visualizer, nextRequest: data.nextRequest });
      }
      if (data.type === 'error') {
        const testResults = data.testResults || [];
        testResults.push({ name: 'Script Execution', passed: false, error: data.error || 'Script error' });
        finish({ testResults, visualizerData: data.visualizer, nextRequest: data.nextRequest, error: data.error });
      }
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage({ type: 'run', executionId, code, context }, '*');
    });
    document.body.appendChild(iframe);
  });
}

export async function runPreRequestScript(script?: string, collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  if (!script || !script.trim()) return;
  try {
    const result = await runInSandbox(script, snapshotContext(collectionId, iterationData, localVariables), collectionId, localVariables);
    if (result.error) console.error('Pre-request script error', result.error);
    return { nextRequest: result.nextRequest };
  } catch (e) {
    console.error('Pre-request script error', e);
    return { nextRequest: undefined };
  }
}

export async function runTestScript(
  script: string | undefined,
  response: { status: number; statusText: string; headers: Record<string, string>; body: string; time: number },
  collectionId?: string,
  iterationData?: Record<string, any>,
  localVariables = new Map<string, string>()
) {
  if (!script || !script.trim()) return undefined;
  let parsedJson: unknown = null;
  try { parsedJson = JSON.parse(response.body); } catch { /* not json */ }
  const context = {
    ...snapshotContext(collectionId, iterationData, localVariables),
    response: { ...response, json: parsedJson },
  };
  return runInSandbox(script, context, collectionId, localVariables);
}
