import { v4 as uuidv4 } from 'uuid';

// Setup environment for the script. Heavy libs load only when a script message arrives.
self.onmessage = async (e) => {
  const [{ default: _ }, { default: moment }, { default: CryptoJS }, chai] = await Promise.all([
    import('lodash'),
    import('moment'),
    import('crypto-js'),
    import('chai'),
  ]);
  const { assert, expect } = chai;
  const { code, context, executionId } = e.data;
  
  let testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

  const pm = {
    environment: {
      get: (key: string) => context.environment?.[key],
      set: (key: string, value: any) => {
        postMessage({ type: 'mutation', scope: 'environment', action: 'set', key, value });
      }
    },
    globals: {
      get: (key: string) => context.globals?.[key],
      set: (key: string, value: any) => {
        postMessage({ type: 'mutation', scope: 'globals', action: 'set', key, value });
      }
    },
    variables: {
      get: (key: string) => context.variables?.[key]
    },
    request: context.request,
    response: context.response,
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
      log: (...args: any[]) => postMessage({ type: 'log', level: 'info', args }),
      warn: (...args: any[]) => postMessage({ type: 'log', level: 'warn', args }),
      error: (...args: any[]) => postMessage({ type: 'log', level: 'error', args }),
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
