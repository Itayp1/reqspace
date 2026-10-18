import { sanitizeRequestSnapshot } from '../utils/historySnapshot';

describe('sanitizeRequestSnapshot', () => {
  it('drops base64 content of form-data files but keeps name and size', () => {
    const content = Buffer.alloc(3000, 1).toString('base64');
    const out: any = sanitizeRequestSnapshot({
      method: 'POST', url: 'http://x',
      body: { _isFormData: true, items: [{ type: 'text', key: 'a', value: '1' }, { type: 'file', key: 'f', filename: 'f.bin', content }] },
    }, 1024 * 1024);
    expect(JSON.stringify(out).length).toBeLessThan(500);
    expect(out.body.items[1]).toMatchObject({ key: 'f', filename: 'f.bin', size: 3000 });
    expect(out.body.items[1].content).toBeUndefined();
    expect(out.body.items[0].value).toBe('1');
  });

  it('truncates an oversized string body with a marker', () => {
    const out: any = sanitizeRequestSnapshot({ method: 'POST', body: 'x'.repeat(5000) }, 1000);
    expect(out.body.endsWith('[truncated]')).toBe(true);
    expect(out.bodyTruncated).toBe(true);
    expect(out.body.length).toBeLessThan(1100);
  });

  it('leaves small bodies untouched', () => {
    const snap = { method: 'POST', body: 'hello' };
    expect(sanitizeRequestSnapshot(snap, 1000)).toBe(snap);
  });
});
