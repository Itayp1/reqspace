import { assert, expect } from 'chai';
import _ from 'lodash';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

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

    const pm = {
      environment: {
        get: (key: string) => variables?.environment?.[key],
        set: (key: string, value: any) => {
          variableWrites.push({ scope: 'environment', action: 'set', key, value });
        }
      },
      globals: {
        get: (key: string) => variables?.globals?.[key],
        set: (key: string, value: any) => {
          variableWrites.push({ scope: 'globals', action: 'set', key, value });
        }
      },
      variables: {
        get: (key: string) => variables?.local?.[key]
      },
      request,
      response,
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
      console: {
        log: (...args: any[]) => consoleLines.push({ level: 'info', args }),
        warn: (...args: any[]) => consoleLines.push({ level: 'warn', args }),
        error: (...args: any[]) => consoleLines.push({ level: 'error', args }),
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
          postMessage({ type: 'result', variableWrites, testResults, consoleLines, visualizer });
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
