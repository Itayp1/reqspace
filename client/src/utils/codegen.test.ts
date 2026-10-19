import { describe, it, expect } from 'vitest';
import { bodyForCode, generateSnippet, type CodeRequest } from './codegen';

const id = (s: string) => s;

function req(body: CodeRequest['body'], headers: Array<[string, string]> = []): CodeRequest {
  return { method: 'POST', url: 'https://api.example.test/items', headers, body };
}

describe('bodyForCode', () => {
  it('maps every body mode the editor offers', () => {
    expect(bodyForCode({ mode: 'none' }, id)).toEqual({ kind: 'none' });
    expect(bodyForCode({ mode: 'raw', raw: '{"a":1}', rawLanguage: 'json' }, id)).toEqual({ kind: 'json', text: '{"a":1}' });
    expect(bodyForCode({ mode: 'raw', raw: '<x/>', rawLanguage: 'xml' }, id)).toEqual({ kind: 'text', text: '<x/>', contentType: 'application/xml' });
    expect(bodyForCode({ mode: 'urlencoded', urlencoded: [{ key: 'a', value: '1', enabled: true }, { key: 'off', value: 'x', enabled: false }] }, id))
      .toEqual({ kind: 'urlencoded', pairs: [['a', '1']] });
    expect(bodyForCode({ mode: 'form-data', formData: [{ key: 'f', value: 'v', enabled: true }, { key: 'up', type: 'file', enabled: true, file: { name: 'a.png' } }] }, id))
      .toEqual({ kind: 'form', fields: [{ key: 'f', value: 'v' }, { key: 'up', value: '', fileName: 'a.png' }] });
    expect(bodyForCode({ mode: 'graphql', graphql: { query: '{ me { id } }', variables: '{"x":1}' } }, id))
      .toEqual({ kind: 'json', text: JSON.stringify({ query: '{ me { id } }', variables: { x: 1 } }) });
  });

  it('resolves variables in body values', () => {
    const resolve = (s: string) => s.replace('{{v}}', 'resolved');
    expect(bodyForCode({ mode: 'urlencoded', urlencoded: [{ key: 'a', value: '{{v}}', enabled: true }] }, resolve))
      .toEqual({ kind: 'urlencoded', pairs: [['a', 'resolved']] });
  });
});

describe('generateSnippet', () => {
  const urlencoded = req({ kind: 'urlencoded', pairs: [['a', '1'], ['b', 'two words']] });
  const form = req({ kind: 'form', fields: [{ key: 'name', value: 'rex' }, { key: 'pic', value: '', fileName: 'pic.png' }] });

  it('keeps url-encoded bodies (they used to be dropped from every snippet)', () => {
    const curl = generateSnippet('curl', urlencoded);
    expect(curl).toContain("--data-urlencode 'a=1'");
    expect(curl).toContain("--data-urlencode 'b=two words'");
    expect(curl).toContain("Content-Type: application/x-www-form-urlencoded");
    expect(generateSnippet('fetch', urlencoded)).toContain('new URLSearchParams()');
    expect(generateSnippet('python-requests', urlencoded)).toContain('("b", "two words")');
    expect(generateSnippet('go', urlencoded)).toContain('strings.NewReader("a=1&b=two%20words")');
    expect(generateSnippet('csharp', urlencoded)).toContain('new FormUrlEncodedContent');
  });

  it('keeps form-data bodies, files included, and leaves the multipart boundary to the library', () => {
    expect(generateSnippet('curl', form)).toContain("-F 'pic=@pic.png'");
    const fetchCode = generateSnippet('fetch', form);
    expect(fetchCode).toContain('new FormData()');
    expect(fetchCode).toContain('body.append("name", "rex")');
    const go = generateSnippet('go', form);
    expect(go).toContain('multipart.NewWriter(&buf)');
    expect(go).toContain('form.FormDataContentType()');
    expect(go).toContain('"mime/multipart"');
    expect(generateSnippet('python-requests', form)).toContain('("name", (None, "rex"))');
    expect(generateSnippet('csharp', form)).toContain('new MultipartFormDataContent()');
  });

  it('sends a non-JSON raw body as text instead of wrapping it in JSON.stringify', () => {
    const xml = req({ kind: 'text', text: '<a href="x">it\'s</a>', contentType: 'application/xml' });
    expect(generateSnippet('fetch', xml)).toContain('body: "<a href=\\"x\\">it\'s</a>"');
    expect(generateSnippet('curl', xml)).toContain(`--data-raw '<a href="x">it'\\''s</a>'`);
    expect(generateSnippet('python-httpx', xml)).toContain('content=payload');
  });

  it('escapes header values for every language', () => {
    const quoted = req({ kind: 'none' }, [['X-Quote', 'say "hi"']]);
    expect(generateSnippet('python-requests', quoted)).toContain('"X-Quote": "say \\"hi\\""');
    expect(generateSnippet('go', quoted)).toContain('req.Header.Set("X-Quote", "say \\"hi\\"")');
  });

  it('puts Content-Type on the content in C#, where request.Headers would throw', () => {
    const cs = generateSnippet('csharp', req({ kind: 'json', text: '{"a":1}' }, [['Content-Type', 'application/json'], ['X-A', '1']]));
    expect(cs).not.toContain('TryAddWithoutValidation("Content-Type"');
    expect(cs).toContain('new StringContent("{\\"a\\":1}", Encoding.UTF8, "application/json")');
    expect(cs).toContain('TryAddWithoutValidation("X-A", "1")');
  });

  it('uses json= for JSON bodies in Python and carries GraphQL as JSON', () => {
    expect(generateSnippet('python-requests', req({ kind: 'json', text: '{"a":true}' }))).toContain('json.loads("{\\"a\\":true}")');
    const gql = bodyForCode({ mode: 'graphql', graphql: { query: '{ x }', variables: '' } }, id);
    expect(generateSnippet('curl', req(gql))).toContain('"query":"{ x }"');
  });
});
