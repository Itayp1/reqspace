import _ from 'lodash';
import moment from 'moment';
import CryptoJS from 'crypto-js';
import * as chai from 'chai';
import { useEnvironmentStore } from '../store/environmentStore';
import { useCollectionStore } from '../store/collectionStore';
import { useConsoleStore } from '../store/consoleStore';
import { sendRequest } from '../transport';

export function runPreRequestScript(script?: string, collectionId?: string, iterationData?: Record<string, any>, localVariables = new Map<string, string>()) {
  if (!script || !script.trim()) return;
  let nextRequest: string | null | undefined = undefined;
  
  try {
    const reqSpace = {
      setNextRequest: (requestNameOrId: string | null) => {
        nextRequest = requestNameOrId;
      }
    };
    
    const pm = {
      environment: {
        get: (key: string) => {
          const { environments, activeEnvironmentId } = useEnvironmentStore.getState();
          const activeEnv = environments.find(e => e._id === activeEnvironmentId);
          return activeEnv?.variables.find(v => v.key === key)?.currentValue;
        },
        set: (key: string, value: string) => {
          const { environments, activeEnvironmentId, setEnvironments } = useEnvironmentStore.getState();
          const activeEnv = environments.find(e => e._id === activeEnvironmentId);
          if (activeEnv) {
            const existing = activeEnv.variables.find(v => v.key === key);
            let newVars;
            if (existing) {
              newVars = activeEnv.variables.map(v => v.key === key ? { ...v, currentValue: value } : v);
            } else {
              newVars = [...activeEnv.variables, { key, initialValue: value, currentValue: value, isSecret: false, enabled: true }];
            }
            setEnvironments(environments.map(e => e._id === activeEnv._id ? { ...e, variables: newVars } : e));
          }
        }
      },
      globals: {
        get: (key: string) => {
          const { globalEnvironment } = useEnvironmentStore.getState();
          return globalEnvironment?.variables.find(v => v.key === key)?.currentValue;
        },
        set: (key: string, value: string) => {
          const { globalEnvironment, setGlobalEnvironment } = useEnvironmentStore.getState();
          if (globalEnvironment) {
            const existing = globalEnvironment.variables.find(v => v.key === key);
            let newVars;
            if (existing) {
              newVars = globalEnvironment.variables.map(v => v.key === key ? { ...v, currentValue: value } : v);
            } else {
              newVars = [...globalEnvironment.variables, { key, initialValue: value, currentValue: value, isSecret: false, enabled: true }];
            }
            setGlobalEnvironment({ ...globalEnvironment, variables: newVars });
          }
        }
      },
      collectionVariables: {
        get: (key: string) => {
          if (!collectionId) return undefined;
          const { collections } = useCollectionStore.getState();
          const col = collections.find(c => c._id === collectionId);
          return col?.variables?.find(v => v.key === key)?.value;
        },
        set: (key: string, value: string) => {
          if (!collectionId) return;
          const { collections, setCollections } = useCollectionStore.getState();
          const col = collections.find(c => c._id === collectionId);
          if (col) {
            const vars = col.variables || [];
            const existing = vars.find(v => v.key === key);
            let newVars;
            if (existing) {
              newVars = vars.map(v => v.key === key ? { ...v, value } : v);
            } else {
              newVars = [...vars, { key, value, enabled: true }];
            }
            setCollections(collections.map(c => c._id === collectionId ? { ...c, variables: newVars } : c));
          }
        }
      },
      iterationData: {
        get: (key: string) => iterationData?.[key],
      },
      variables: {
        get: (key: string) => {
          if (localVariables.has(key)) return localVariables.get(key);
          if (iterationData && key in iterationData) return iterationData[key];
          
          const { environments, activeEnvironmentId, globalEnvironment } = useEnvironmentStore.getState();
          const activeEnv = environments.find(e => e._id === activeEnvironmentId);
          const envVal = activeEnv?.variables.find(v => v.key === key)?.currentValue;
          if (envVal !== undefined) return envVal;

          if (collectionId) {
            const { collections } = useCollectionStore.getState();
            const col = collections.find(c => c._id === collectionId);
            const colVal = col?.variables?.find(v => v.key === key)?.value;
            if (colVal !== undefined) return colVal;
          }

          const globVal = globalEnvironment?.variables.find(v => v.key === key)?.currentValue;
          if (globVal !== undefined) return globVal;

          return undefined;
        },
        set: (key: string, value: string) => {
          localVariables.set(key, value);
        }
      }
    };
    const consoleMock = {
      log: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'log', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      },
      error: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'error', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      },
      warn: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'warn', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      },
      info: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'log', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      }
    };
    
    const fn = new Function('pm', 'reqSpace', '_', 'moment', 'CryptoJS', 'console', script);
    fn(pm, reqSpace, _, moment, CryptoJS, consoleMock);
  } catch (e) {
    console.error('Pre-request script error', e);
  }
  return { nextRequest };
}

export function runTestScript(
  script: string | undefined,
  response: { status: number; statusText: string; headers: Record<string, string>; body: string; time: number },
  collectionId?: string,
  iterationData?: Record<string, any>,
  localVariables = new Map<string, string>()
) {
  if (!script || !script.trim()) return undefined;
  const testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

  let visualizerData: { template: string; data?: any } | undefined;
  let nextRequest: string | null | undefined = undefined;

  try {
    let parsedJson: any = null;
    try {
      parsedJson = JSON.parse(response.body);
    } catch {
      // ignore
    }

    const reqSpace = {
      setNextRequest: (requestNameOrId: string | null) => {
        nextRequest = requestNameOrId;
      }
    };

    const pm = {
      visualizer: {
        set: (template: string, data?: any) => {
          visualizerData = { template, data };
        }
      },
      sendRequest: (urlOrConfig: any, cb: (err: any, res: any) => void) => {
        const url = typeof urlOrConfig === 'string' ? urlOrConfig : urlOrConfig.url;
        const method = urlOrConfig.method || 'GET';
        sendRequest({ method, url, headers: urlOrConfig.header || {} })
          .then(res => cb(null, { ...res, json: () => res.body }))
          .catch(err => cb(err, null));
      },
      response: {
        code: response.status,
        status: response.statusText,
        responseTime: response.time,
        headers: response.headers,
        json: () => parsedJson !== null ? parsedJson : JSON.parse(response.body),
        text: () => response.body,
      },
      test: (name: string, fn: () => void) => {
        try {
          fn();
          testResults.push({ name, passed: true });
        } catch (err: any) {
          testResults.push({ name, passed: false, error: err.message || String(err) });
        }
      },
      expect: chai.expect,
      environment: {
        get: (key: string) => {
          const { environments, activeEnvironmentId } = useEnvironmentStore.getState();
          const activeEnv = environments.find(e => e._id === activeEnvironmentId);
          return activeEnv?.variables.find(v => v.key === key)?.currentValue;
        },
        set: (key: string, value: string) => {
          const { environments, activeEnvironmentId, setEnvironments } = useEnvironmentStore.getState();
          const activeEnv = environments.find(e => e._id === activeEnvironmentId);
          if (activeEnv) {
            const existing = activeEnv.variables.find(v => v.key === key);
            let newVars;
            if (existing) {
              newVars = activeEnv.variables.map(v => v.key === key ? { ...v, currentValue: value } : v);
            } else {
              newVars = [...activeEnv.variables, { key, initialValue: value, currentValue: value, isSecret: false, enabled: true }];
            }
            setEnvironments(environments.map(e => e._id === activeEnv._id ? { ...e, variables: newVars } : e));
          }
        }
      },
      globals: {
        get: (key: string) => {
          const { globalEnvironment } = useEnvironmentStore.getState();
          return globalEnvironment?.variables.find(v => v.key === key)?.currentValue;
        },
        set: (key: string, value: string) => {
          const { globalEnvironment, setGlobalEnvironment } = useEnvironmentStore.getState();
          if (globalEnvironment) {
            const existing = globalEnvironment.variables.find(v => v.key === key);
            let newVars;
            if (existing) {
              newVars = globalEnvironment.variables.map(v => v.key === key ? { ...v, currentValue: value } : v);
            } else {
              newVars = [...globalEnvironment.variables, { key, initialValue: value, currentValue: value, isSecret: false, enabled: true }];
            }
            setGlobalEnvironment({ ...globalEnvironment, variables: newVars });
          }
        }
      },
      collectionVariables: {
        get: (key: string) => {
          if (!collectionId) return undefined;
          const { collections } = useCollectionStore.getState();
          const col = collections.find(c => c._id === collectionId);
          return col?.variables?.find(v => v.key === key)?.value;
        },
        set: (key: string, value: string) => {
          if (!collectionId) return;
          const { collections, setCollections } = useCollectionStore.getState();
          const col = collections.find(c => c._id === collectionId);
          if (col) {
            const vars = col.variables || [];
            const existing = vars.find(v => v.key === key);
            let newVars;
            if (existing) {
              newVars = vars.map(v => v.key === key ? { ...v, value } : v);
            } else {
              newVars = [...vars, { key, value, enabled: true }];
            }
            setCollections(collections.map(c => c._id === collectionId ? { ...c, variables: newVars } : c));
          }
        }
      },
      iterationData: {
        get: (key: string) => iterationData?.[key],
      },
      variables: {
        get: (key: string) => {
          if (localVariables.has(key)) return localVariables.get(key);
          if (iterationData && key in iterationData) return iterationData[key];
          
          const { environments, activeEnvironmentId, globalEnvironment } = useEnvironmentStore.getState();
          const activeEnv = environments.find(e => e._id === activeEnvironmentId);
          const envVal = activeEnv?.variables.find(v => v.key === key)?.currentValue;
          if (envVal !== undefined) return envVal;

          if (collectionId) {
            const { collections } = useCollectionStore.getState();
            const col = collections.find(c => c._id === collectionId);
            const colVal = col?.variables?.find(v => v.key === key)?.value;
            if (colVal !== undefined) return colVal;
          }

          const globVal = globalEnvironment?.variables.find(v => v.key === key)?.currentValue;
          if (globVal !== undefined) return globVal;

          return undefined;
        },
        set: (key: string, value: string) => {
          localVariables.set(key, value);
        }
      }
    };

    const consoleMock = {
      log: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'log', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      },
      error: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'error', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      },
      warn: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'warn', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      },
      info: (...args: any[]) => {
        useConsoleStore.getState().addLog({ type: 'log', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
      }
    };

    const runFn = new Function('pm', 'reqSpace', '_', 'moment', 'CryptoJS', 'console', script);
    runFn(pm, reqSpace, _, moment, CryptoJS, consoleMock);
  } catch (err: any) {
    testResults.push({ name: 'Script Execution', passed: false, error: err.message || String(err) });
  }

  return { testResults, visualizerData, nextRequest };
}
