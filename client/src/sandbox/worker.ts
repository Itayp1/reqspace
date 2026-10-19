import { assert, expect } from 'chai';
import _ from 'lodash';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

const MAX_LOG_LEN = 10000;

// Console arguments are turned into strings inside the worker: Symbols,
// functions and DOM-like objects can't be structured-cloned by postMessage,
// and circular objects break JSON.stringify on the host.
function safeString(value: any): string {
  let out: string;
  try {
    if (typeof value === 'string') out = value;
    else if (typeof value === 'symbol' || typeof value === 'function' || value === undefined) out = String(value);
    else if (typeof value === 'bigint') out = `${value}n`;
    else if (value && typeof value === 'object') {
      const seen = new WeakSet();
      out = JSON.stringify(value, (_k, v) => {
        if (typeof v === 'bigint') return `${v}n`;
        if (typeof v === 'symbol' || typeof v === 'function') return String(v);
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      });
    } else out = String(value);
  } catch {
    try { out = String(value); } catch { out = '[unserializable]'; }
  }
  return out.length > MAX_LOG_LEN ? out.slice(0, MAX_LOG_LEN) + '… [truncated]' : out;
}

const callbacks = new Map<string, (err: any, res: any) => void>();

self.onmessage = async (e) => {
  const data = e.data;

  if (data.type === 'sendRequestResult') {
    const cb = callbacks.get(data.id);
    if (cb) {
      callbacks.delete(data.id);
      if (data.error) cb(data.error, null);
      else {
        const resObj = { ...data.response };
        resObj.json = () => typeof resObj.body === 'string' ? JSON.parse(resObj.body) : resObj.body;
        resObj.text = () => typeof resObj.body === 'string' ? resObj.body : JSON.stringify(resObj.body);
        cb(null, resObj);
      }
    }
    return;
  }

  if (data.type === 'run') {
    const { script, request, response, variables } = data;
    
    let testResults: Array<{ name: string; passed: boolean; error?: string }> = [];
    let variableWrites: Array<{ scope: string; action: string; key: string; value: any }> = [];
    let consoleLines: Array<{ level: string; args: any[] }> = [];
    let visualizer: { template: string; data?: any } | undefined;

    // In-run copies so a get() after a set()/unset() in the same script sees
    // the change (the real stores are only updated by the host afterwards).
    const envState: Record<string, any> = { ...(variables?.environment || {}) };
    const globState: Record<string, any> = { ...(variables?.globals || {}) };
    const localState: Record<string, any> = { ...(variables?.local || {}) };
    const makeScope = (scope: string, state: Record<string, any>) => ({
      get: (key: string) => state[key],
      has: (key: string) => Object.prototype.hasOwnProperty.call(state, key),
      set: (key: string, value: any) => {
        state[key] = value;
        variableWrites.push({ scope, action: 'set', key, value });
      },
      unset: (key: string) => {
        delete state[key];
        variableWrites.push({ scope, action: 'unset', key, value: undefined });
      },
      clear: () => {
        Object.keys(state).forEach((k) => delete state[k]);
        variableWrites.push({ scope, action: 'clear', key: '', value: undefined });
      },
    });

    // Response helpers (pm.response.json()/text()/headers.get()).
    let pmResponse: any = response;
    if (response) {
      const rawHeaders = response.headers || {};
      const findHeader = (name: string) => {
        const k = Object.keys(rawHeaders).find((h) => h.toLowerCase() === String(name).toLowerCase());
        return k === undefined ? undefined : rawHeaders[k];
      };
      const headers: any = { ...rawHeaders };
      Object.defineProperty(headers, 'get', { value: findHeader, enumerable: false });
      Object.defineProperty(headers, 'has', { value: (n: string) => findHeader(n) !== undefined, enumerable: false });
      const text = () => typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
      pmResponse = {
        ...response,
        headers,
        text,
        json: () => typeof response.body === 'string' ? JSON.parse(response.body) : response.body,
      };
    }

    // pm.request is a mutable copy; changes are returned to the host as requestMods.
    const pmRequest: any = request ? { ...request, headers: { ...(request.headers || {}) } } : undefined;

    const pm = {
      environment: makeScope('environment', envState),
      globals: makeScope('globals', globState),
      collectionVariables: makeScope('collection', localState),
      variables: makeScope('local', localState),
      request: pmRequest,
      response: pmResponse,
      test: (name: string, fn: () => void) => {
        try {
          fn();
          testResults.push({ name, passed: true });
        } catch (err: any) {
          testResults.push({ name, passed: false, error: err.message });
        }
      },
      expect: expect,
      sendRequest: (req: any, callback: (err: any, res: any) => void) => {
         const id = uuidv4();
         callbacks.set(id, callback);
         postMessage({ type: 'sendRequest', id, request: req });
      },
      visualizer: {
        set: (template: string, data?: any) => {
          visualizer = { template, data };
        }
      }
    };

    const sandboxScope = {
      pm,
      reqSpace: {
        setNextRequest: (requestNameOrId: string | null) => {
          variableWrites.push({ scope: 'reqSpace', action: 'setNextRequest', key: 'nextRequest', value: requestNameOrId });
        }
      },
      req: {
        headers: {
          set: (name: string, value: any) => variableWrites.push({ scope: 'header', action: 'set', key: name, value }),
          remove: (name: string) => variableWrites.push({ scope: 'header', action: 'remove', key: name, value: undefined }),
          get: (name: string) => request?.headers?.[name] || request?.header?.[name]
        },
        variables: {
          set: (key: string, value: any) => { localState[key] = value; variableWrites.push({ scope: 'local', action: 'set', key, value }); },
          get: (key: string) => localState[key]
        }
      },
      console: {
        // 'log' (not 'info') — these levels are fed straight into
        // ConsoleLogEntry.type, whose union is request | log | error | warn.
        log: (...args: any[]) => consoleLines.push({ level: 'log', args: args.map(safeString) }),
        warn: (...args: any[]) => consoleLines.push({ level: 'warn', args: args.map(safeString) }),
        error: (...args: any[]) => consoleLines.push({ level: 'error', args: args.map(safeString) }),
      },
      require: (moduleName: string) => {
        if (moduleName === 'lodash') return _;
        if (moduleName === 'moment') return moment;
        if (moduleName === 'uuid') return { v4: uuidv4 };
        if (moduleName === 'crypto-js') return CryptoJS;
        if (moduleName === 'chai') return { assert, expect };
        throw new Error(`Module ${moduleName} not found`);
      }
    };

    const keys = Object.keys(sandboxScope);
    const values = Object.values(sandboxScope);

    try {
      const fn = new Function(...keys, `
        try {
          ${script}
        } catch(e) {
          throw e;
        }
      `);

      // Run the code
      // Note: pm.sendRequest callbacks will run asynchronously.
      // We send the 'result' message immediately, but the host must keep the worker alive
      // if it expects callbacks. Wait, the spec says "Worker->host: {type:'result', variableWrites, testResults, consoleLines, visualizer?}"
      fn(...values);
      
      // Wait for any pending sendRequest callbacks to finish before returning result?
      // No, we can't synchronously block. If they use async, the run might complete before callbacks.
      // But typically postman scripts are synchronous. pm.sendRequest uses callbacks.
      // Actually, if we post 'result' immediately, we might miss variableWrites from inside callbacks.
      // Let's wrap it in a small wait if callbacks exist, or just post 'result' and let the host handle async writes?
      // "The host validates scope and key before applying variableWrites; the worker never touches a store."
      
      const checkDone = () => {
        if (callbacks.size === 0) {
          postMessage({ type: 'result', variableWrites, testResults, consoleLines, visualizer, requestMods: pmRequest });
        } else {
          setTimeout(checkDone, 50);
        }
      };
      checkDone();

    } catch (err: any) {
      postMessage({ type: 'error', error: err.message });
    }
  }
};
