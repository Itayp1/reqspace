import SandboxWorker from '../sandbox/worker?worker';
import { useEnvironmentStore } from '../store/environmentStore';
import { useCollectionStore } from '../store/collectionStore';
import { useConsoleStore } from '../store/consoleStore';
import api from '../api/axios';

interface ScriptResult {
  nextRequest?: string;
  testResults: Array<{ name: string; passed: boolean; error?: string }>;
  visualizerData?: { template: string; data?: any };
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
}): Promise<ScriptResult> {
  if (!script || !script.trim()) return { testResults: [] };
  
  return new Promise<ScriptResult>((resolve) => {
    let requestCount = 0;
    const worker = new SandboxWorker();
    
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'result') {
        worker.terminate();
        
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
           }
        });
        
        msg.consoleLines?.forEach((c: any) => {
           useConsoleStore.getState().addLog({ type: c.level as any, message: c.args.map((a: any) => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
        });
        
        resolve({
           nextRequest: msg.variableWrites?.find((w: any) => w.scope === 'reqSpace' && w.key === 'nextRequest')?.value,
           testResults: msg.testResults || [],
           visualizerData: msg.visualizer
        });
      } else if (msg.type === 'error') {
        worker.terminate();
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
        api.post('/proxy', { method, url, headers: request.header || {} })
          .then((res: any) => {
            worker.postMessage({ type: 'sendRequestResult', id, response: res.data });
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
    
    worker.postMessage({ type: 'run', phase, script, response: serializedResponse, variables });
  });
}

export async function runPreRequestScript(script?: string, collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  if (!script || !script.trim()) return undefined;
  return executeInSandbox('pre-request', script, { collectionId, iterationData, localVariables });
}

export async function runTestScript(script?: string, response?: any, collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  if (!script || !script.trim()) return undefined;
  return executeInSandbox('test', script, { collectionId, iterationData, localVariables, response });
}
