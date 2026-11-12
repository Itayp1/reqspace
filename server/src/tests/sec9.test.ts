import request from 'supertest';
import { app } from '../index';

describe('SEC-9: Zod validation', () => {
  it('every POST/PUT/PATCH route must have validate middleware', () => {
    const stack = app._router.stack;
    const routes: { method: string, path: string, middlewares: string[] }[] = [];
    
    // Express internals traversal
    function traverse(layer: any, prefix = '') {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).filter(m => ['post', 'put', 'patch'].includes(m));
        if (methods.length > 0) {
          const mws = layer.route.stack.map((s: any) => s.name);
          for (const m of methods) {
            routes.push({ method: m, path: prefix + layer.route.path, middlewares: mws });
          }
        }
      } else if (layer.name === 'router' && layer.handle.stack) {
        const p = prefix + (layer.regexp.source !== '^\\/?$' ? layer.regexp.source.replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/') : '');
        layer.handle.stack.forEach((l: any) => traverse(l, p));
      }
    }
    
    stack.forEach((l: any) => traverse(l));
    
    const missing = routes.filter(r => !r.middlewares.some(m => m === 'validateMiddleware'));
    
    // There might be some routes like POST /logout which we skipped, but wait, I added validate(z.any()) to logout!
    if (missing.length > 0) {
      throw new Error('The following routes are missing Zod validation:\n' + missing.map(r => `${r.method} ${r.path}`).join('\n'));
    }
    expect(missing.length).toBe(0);
  });
});
