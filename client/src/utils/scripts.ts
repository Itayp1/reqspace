import SandboxWorker from '../sandbox/worker?worker';
import { useEnvironmentStore } from '../store/environmentStore';
import { useCollectionStore } from '../store/collectionStore';
import { useConsoleStore } from '../store/consoleStore';
import { sendRequest } from '../transport';

interface ScriptResult {
  nextRequest?: string;
  testResults: Array<{ name: string; passed: boolean; error?: string }>;
  visualizerData?: { template: string; data?: any };
  headerWrites?: Record<string, string>;
  removedHeaders?: string[];
  /** Final state of pm.request after the script ran (pre-request only). */
  requestMods?: { url?: string; method?: string; headers?: Record<string, string>; body?: any };
}

function serializeVariables(collectionId?: string, iterationData?: Record<string, any>, localVariables?: Map<string, string>) {
  const { environments, activeEnvironmentId, globalEnvironment, localVariables: storeLocalVars } = useEnvironmentStore.getState();
  const activeEnv = environments.find((e: any) => e._id === activeEnvironmentId);
  const { collections } = useCollectionStore.getState();
  const col = collections.find((c: any) => c._id === collectionId);
  
  const envVars = activeEnv?.variables.reduce((acc: any, v: any) => ({...acc, [v.key]: v.currentValue}), {}) || {};
  const globVars = globalEnvironment?.variables.reduce((acc: any, v: any) => ({...acc, [v.key]: v.currentValue}), {}) || {};
  const localVars = storeLocalVars?.reduce((acc: any, v: any) => ({...acc, [v.key]: v.value !== undefined ? v.value : v.currentValue}), {}) || {};
  
  if (col) col.variables?.forEach((v: any) => localVars[v.key] = v.value);
  if (iterationData) Object.assign(localVars, iterationData);
  if (localVariables) localVariables.forEach((val: any, key: any) => localVars[key] = val);
  
  return { environment: envVars, globals: globVars, local: localVars };
}

async function executeInSandbox(phase: 'pre-request' | 'test', script: string, options: {
  collectionId?: string;
  iterationData?: Record<string, any>;
  localVariables?: Map<string, string>;
  response?: any;
  request?: { url: string; method: string; headers: Record<string, string>; body?: any };
}): Promise<ScriptResult> {
  if (!script || !script.trim()) return { testResults: [] };
  
  return new Promise<ScriptResult>((resolve) => {
    let requestCount = 0;
    const worker = new SandboxWorker();
    
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'result') {
        worker.terminate();
        
        const headerWrites: Record<string, string> = {};
        const removedHeaders: string[] = [];

        msg.variableWrites?.forEach((w: any) => {
           if (w.scope === 'environment' && w.action === 'set') {
             const { environments, activeEnvironmentId, setEnvironments } = useEnvironmentStore.getState();
             const activeEnv = environments.find((e: any) => e._id === activeEnvironmentId);
             if (activeEnv) {
               const existing = activeEnv.variables.find((v: any) => v.key === w.key);
               let newVars;
               if (existing) {
                 newVars = activeEnv.variables.map((v: any) => v.key === w.key ? { ...v, currentValue: w.value } : v);
               } else {
                 newVars = [...activeEnv.variables, { key: w.key, initialValue: String(w.value), currentValue: String(w.value), isSecret: false, enabled: true }];
               }
               setEnvironments(environments.map((e: any) => e._id === activeEnv._id ? { ...e, variables: newVars } : e));
             }
           } else if (w.scope === 'environment' && (w.action === 'unset' || w.action === 'clear')) {
             const { environments, activeEnvironmentId, setEnvironments } = useEnvironmentStore.getState();
             const activeEnv = environments.find((e: any) => e._id === activeEnvironmentId);
             if (activeEnv) {
               const newVars = activeEnv.variables.filter((v: any) => w.action === 'clear' ? false : v.key !== w.key);
               setEnvironments(environments.map((e: any) => e._id === activeEnv._id ? { ...e, variables: newVars } : e));
             }
           } else if (w.scope === 'globals' && (w.action === 'unset' || w.action === 'clear')) {
             const { globalEnvironment, setGlobalEnvironment } = useEnvironmentStore.getState();
             if (globalEnvironment) {
               const newVars = globalEnvironment.variables.filter((v: any) => w.action === 'clear' ? false : v.key !== w.key);
               setGlobalEnvironment({ ...globalEnvironment, variables: newVars });
             }
           } else if (w.scope === 'globals' && w.action === 'set') {
             const { globalEnvironment, setGlobalEnvironment } = useEnvironmentStore.getState();
             if (globalEnvironment) {
               const existing = globalEnvironment.variables.find((v: any) => v.key === w.key);
               let newVars;
               if (existing) {
                 newVars = globalEnvironment.variables.map((v: any) => v.key === w.key ? { ...v, currentValue: w.value } : v);
               } else {
                 newVars = [...globalEnvironment.variables, { key: w.key, initialValue: String(w.value), currentValue: String(w.value), isSecret: false, enabled: true }];
               }
               setGlobalEnvironment({ ...globalEnvironment, variables: newVars });
             }
           } else if (w.scope === 'reqSpace' && w.action === 'setNextRequest') {
             // This is captured and returned at the end, nothing to mutate in store.
           } else if (w.scope === 'header') {
             if (w.action === 'set') {
               headerWrites[w.key] = String(w.value);
             } else if (w.action === 'remove') {
               removedHeaders.push(w.key);
             }
           } else if ((w.scope === 'local' || w.scope === 'collection') && w.action === 'set') {
             options.localVariables?.set(w.key, String(w.value));
           } else if ((w.scope === 'local' || w.scope === 'collection') && w.action === 'unset') {
             options.localVariables?.delete(w.key);
           } else if ((w.scope === 'local' || w.scope === 'collection') && w.action === 'clear') {
             options.localVariables?.clear();
           }
        });
        
        msg.consoleLines?.forEach((c: any) => {
           useConsoleStore.getState().addLog({ type: c.level as any, message: c.args.map((a: any) => String(a)).join(' ') });
        });
        
        resolve({
           nextRequest: msg.variableWrites?.find((w: any) => w.scope === 'reqSpace' && w.key === 'nextRequest')?.value,
           testResults: msg.testResults || [],
           visualizerData: msg.visualizer,
           headerWrites,
           removedHeaders,
           requestMods: msg.requestMods
        });
      } else if (msg.type === 'error') {
        worker.terminate();
        useConsoleStore.getState().addLog({ type: 'error', message: msg.error });
        resolve({ testResults: [{ name: 'Script Execution', passed: false, error: msg.error }] });
      } else if (msg.type === 'sendRequest') {
        const { id, request } = msg;
        requestCount++;
        if (requestCount > 10) {
          worker.postMessage({ type: 'sendRequestResult', id, error: 'Request limit exceeded (10 max)' });
          return;
        }
        const url = typeof request === 'string' ? request : request.url;
        const method = request.method || 'GET';
        sendRequest({ method, url, headers: request.header || {} })
          .then((res: any) => {
            worker.postMessage({ type: 'sendRequestResult', id, response: { ...res, code: res.status } });
          })
          .catch((err: any) => {
             worker.postMessage({ type: 'sendRequestResult', id, error: err.message });
          });
      }
    };
    
    worker.onerror = (err) => {
      worker.terminate();
      resolve({ testResults: [{ name: 'Script Execution', passed: false, error: err.message }] });
    };
    
    const variables = serializeVariables(options.collectionId, options.iterationData, options.localVariables);
    
    let serializedResponse = undefined;
    if (options.response) {
      serializedResponse = {
        code: options.response.status,
        status: options.response.statusText,
        responseTime: options.response.time,
        headers: options.response.headers,
        body: options.response.body,
      };
    }
    
    worker.postMessage({ type: 'run', phase, script, request: options.request, response: serializedResponse, variables });
  });
}

export async function runPreRequestScript(script?: string, collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>(), request?: { url: string; method: string; headers: Record<string, string>; body?: any }) {
  if (!script || !script.trim()) return undefined;
  return executeInSandbox('pre-request', script, { collectionId, iterationData, localVariables, request });
}

export async function runTestScript(script?: string, response?: any, collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  if (!script || !script.trim()) return undefined;
  return executeInSandbox('test', script, { collectionId, iterationData, localVariables, response });
}

type ReqShape = { url: string; method: string; headers: Record<string, string>; body?: any };

/** Returns only the parts of pm.request a pre-request script actually changed. */
export function diffRequestMods(original: ReqShape, mods?: Partial<ReqShape>): { url?: string; method?: string; headers?: Record<string, string>; body?: any } {
  const out: { url?: string; method?: string; headers?: Record<string, string>; body?: any } = {};
  if (!mods) return out;
  if (typeof mods.url === 'string' && mods.url !== original.url) out.url = mods.url;
  if (typeof mods.method === 'string' && mods.method !== original.method) out.method = mods.method;
  if (mods.headers) {
    const changed: Record<string, string> = {};
    for (const [k, v] of Object.entries(mods.headers)) {
      if (original.headers[k] !== v) changed[k] = String(v);
    }
    if (Object.keys(changed).length) out.headers = changed;
  }
  if (mods.body !== undefined && mods.body !== original.body) out.body = mods.body;
  return out;
}
