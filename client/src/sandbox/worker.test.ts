import { describe, it, expect, beforeAll } from 'vitest';

const posted: any[] = [];

async function run(script: string, extra: any = {}) {
  posted.length = 0;
  await (globalThis as any).self.onmessage({ data: { type: 'run', script, variables: { environment: { a: '1' }, globals: {}, local: {} }, ...extra } });
  return posted[posted.length - 1];
}

describe('sandbox worker', () => {
  beforeAll(async () => {
    (globalThis as any).self = globalThis;
    (globalThis as any).postMessage = (m: any) => posted.push(m);
    await import('./worker');
  });

  it('supports environment/globals/collection/variables scopes incl. unset and clear', async () => {
    const r = await run(`
      pm.environment.set('x','2'); pm.environment.unset('a'); pm.globals.set('g','3');
      pm.collectionVariables.set('c','4'); pm.variables.set('v','5');
      pm.environment.clear();
      console.log(pm.environment.get('x'), pm.collectionVariables.get('c'), pm.variables.get('v'));`);
    expect(r.type).toBe('result');
    expect(r.variableWrites.map((w: any) => `${w.scope}:${w.action}`)).toEqual([
      'environment:set', 'environment:unset', 'globals:set', 'collection:set', 'local:set', 'environment:clear',
    ]);
    expect(r.consoleLines[0].args).toEqual(['undefined', '4', '5']);
  });

  it('exposes pm.response.json/text/headers.get', async () => {
    const r = await run(`
      pm.test('t', () => {
        pm.expect(pm.response.json().ok).to.equal(true);
        pm.expect(pm.response.text()).to.equal('{"ok":true}');
        pm.expect(pm.response.headers.get('content-type')).to.equal('application/json');
      });`, { response: { code: 200, status: 'OK', responseTime: 5, headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' } });
    expect(r.testResults).toEqual([{ name: 't', passed: true }]);
  });

  it('returns pm.request modifications', async () => {
    const r = await run(`pm.request.url += '?scripted=1'; pm.request.headers['X-A'] = 'b';`,
      { request: { url: 'http://h/echo', method: 'GET', headers: {} } });
    expect(r.requestMods).toMatchObject({ url: 'http://h/echo?scripted=1', headers: { 'X-A': 'b' } });
  });

  it('console.log of Symbol, circular, undefined and huge values does not throw', async () => {
    const r = await run(`const o={}; o.self=o; console.log(Symbol('s'), undefined, null, o, 'x'.repeat(50000), ()=>1);`);
    expect(r.type).toBe('result');
    expect(r.consoleLines[0].args.slice(0, 4)).toEqual(['Symbol(s)', 'undefined', 'null', '{"self":"[Circular]"}']);
    expect(r.consoleLines[0].args[4].length).toBeLessThan(10100);
  });

  it('status assertions match the response class/code (positive cases the e2e 200 mock cannot show)', async () => {
    const cases: Array<[number, string[]]> = [[100, ['info']], [204, ['success', 'withoutContent']], [302, ['redirection']], [202, ['accepted']], [400, ['clientError', 'error', 'badRequest']],
      [401, ['unauthorized', 'unauthorised']], [403, ['forbidden']], [404, ['notFound']], [406, ['notAcceptable']], [429, ['rateLimited']], [500, ['serverError', 'error']]];
    for (const [code, names] of cases) {
      const r = await run(`${names.map((n) => `pm.test('${n}', () => { pm.response.to.be.${n}; pm.response.to.not.have.status(${code + 1}); });`).join('')}`,
        { response: { code, status: 'X', responseTime: 1, headers: {}, body: '' } });
      expect(r.testResults.filter((t: any) => !t.passed), `code ${code}`).toEqual([]);
    }
  });

  it('pre-request removals and the not-supported members', async () => {
    const r = await run(`pm.request.removeHeader('x-gone'); pm.test('t', () => pm.expect(() => pm.request.proxy).to.throw('pm.request.proxy is not supported'));`,
      { request: { url: 'http://h/x', method: 'GET', headers: { 'X-Gone': '1', 'X-Stay': '2' } } });
    expect(r.requestMods.headers).toEqual({ 'X-Stay': '2' });
    expect(r.testResults).toEqual([{ name: 't', passed: true }]);
  });
});
