import { assert, expect } from 'chai';
import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import set from 'lodash/set';
import merge from 'lodash/merge';
import uniq from 'lodash/uniq';
const _ = { cloneDeep, get, set, merge, uniq };
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

// Setup environment for the script
self.onmessage = async (e) => {
  const { code, context, executionId } = e.data;
  
  let testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

  const pm = {
    visualizer: {
      set: (template: string, data?: any) => postMessage({ type: 'visualizer', template, data, executionId }),
    },
    environment: {
      get: (key: string) => context.environment?.[key],
      set: (key: string, value: any) => {
        context.environment = { ...(context.environment || {}), [key]: value };
        postMessage({ type: 'mutation', scope: 'environment', action: 'set', key, value, executionId });
      }
    },
    globals: {
      get: (key: string) => context.globals?.[key],
      set: (key: string, value: any) => {
        context.globals = { ...(context.globals || {}), [key]: value };
        postMessage({ type: 'mutation', scope: 'globals', action: 'set', key, value, executionId });
      }
    },
    variables: {
      get: (key: string) => context.variables?.[key]
    },
    request: context.request,
    response: context.response ? {
      code: context.response.status,
      status: context.response.statusText,
      responseTime: context.response.time,
      headers: context.response.headers,
      text: () => context.response.body,
      json: () => JSON.parse(context.response.body),
    } : undefined,
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
       // Since it's a web worker, we could use fetch directly here if we want
       // but typically we'd proxy it back to the main thread to use the proxy server.
       // For simplicity in this v1, we will just use fetch in the worker directly if it's external,
       // but wait, CORS! We must route through main thread -> proxy!
       
       // Because of async nature, we'd need to pause script execution or use Promises.
       // ReqSpace's pm.sendRequest is callback-based. 
       postMessage({ type: 'sendRequest', req, executionId });
       // We can't synchronously block a callback in a web worker easily without SharedArrayBuffer.
       // We'll leave a stub for now.
       callback(new Error('pm.sendRequest is currently experimental/stubbed in Web Worker'), null);
    }
  };

  // Expose libs
  const sandboxScope = {
    pm,
    console: {
      log: (...args: any[]) => postMessage({ type: 'log', level: 'info', args, executionId }),
      warn: (...args: any[]) => postMessage({ type: 'log', level: 'warn', args, executionId }),
      error: (...args: any[]) => postMessage({ type: 'log', level: 'error', args, executionId }),
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
        ${code}
      } catch(e) {
        throw e;
      }
    `);

    // We can't easily interrupt an infinite loop in a Worker from within the same Worker
    // The main thread will terminate the worker if it takes > 10s.
    
    // Run the code
    fn(...values);
    
    postMessage({ type: 'done', testResults, executionId });
  } catch (err: any) {
    postMessage({ type: 'error', error: err.message, executionId });
  }
};
