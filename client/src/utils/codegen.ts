/**
 * Code snippets for a request, in the shapes the "</>" dialog offers.
 *
 * The generator used to know only raw bodies: x-www-form-urlencoded,
 * form-data and GraphQL bodies were silently left out of every snippet, so the
 * code sent a different request than Send did. Values were also pasted into
 * string literals unescaped. Everything here takes an already-resolved request
 * (variables substituted, auth applied) and only does the per-language
 * rendering, so it can be unit-tested on its own.
 */

export type Language = 'curl' | 'fetch' | 'axios' | 'python-requests' | 'python-httpx' | 'go' | 'csharp';

export type CodeBody =
  | { kind: 'none' }
  | { kind: 'json'; text: string }
  | { kind: 'text'; text: string; contentType: string }
  | { kind: 'urlencoded'; pairs: Array<[string, string]> }
  | { kind: 'form'; fields: Array<{ key: string; value: string; fileName?: string }> };

export interface CodeRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body: CodeBody;
}

const RAW_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  text: 'text/plain',
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
};

/** Turns a request's stored body into what a snippet has to send. */
export function bodyForCode(
  body: { mode?: string; raw?: string; rawLanguage?: string; urlencoded?: any[]; formData?: any[]; graphql?: { query?: string; variables?: string } } | undefined,
  resolve: (s: string) => string,
): CodeBody {
  if (!body || !body.mode || body.mode === 'none') return { kind: 'none' };
  switch (body.mode) {
    case 'raw': {
      if (!body.raw) return { kind: 'none' };
      const text = resolve(body.raw);
      const lang = body.rawLanguage || 'text';
      if (lang === 'json') return { kind: 'json', text };
      return { kind: 'text', text, contentType: RAW_CONTENT_TYPES[lang] || 'text/plain' };
    }
    case 'urlencoded': {
      const pairs = (body.urlencoded || []).filter(i => i && i.enabled !== false && i.key).map(i => [i.key, resolve(String(i.value ?? ''))] as [string, string]);
      return pairs.length ? { kind: 'urlencoded', pairs } : { kind: 'none' };
    }
    case 'form-data': {
      const fields = (body.formData || []).filter(i => i && i.enabled !== false && i.key).map(i => (
        i.type === 'file'
          ? { key: i.key, value: '', fileName: i.file?.name || 'file' }
          : { key: i.key, value: resolve(String(i.value ?? '')) }
      ));
      return fields.length ? { kind: 'form', fields } : { kind: 'none' };
    }
    case 'graphql': {
      const query = resolve(body.graphql?.query || '');
      const varsText = resolve(body.graphql?.variables || '{}');
      let variables: unknown = varsText;
      try { variables = JSON.parse(varsText || '{}'); } catch { /* keep the text, as Send does */ }
      return { kind: 'json', text: JSON.stringify({ query, variables }) };
    }
    default:
      return { kind: 'none' };
  }
}

// ── literal helpers ─────────────────────────────────────────────────────────
// A JSON string literal is also a valid string literal in JavaScript, Python,
// Go and C# (\" \\ \n \t \uXXXX are understood by all four).
const lit = (s: string) => JSON.stringify(s);
const shell = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function parsedJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false }; }
}

function hasHeader(req: CodeRequest, name: string) {
  return req.headers.some(([k]) => k.toLowerCase() === name.toLowerCase());
}

/** Headers to emit, adding the Content-Type the body implies when the user set none. Multipart is left to the library (it needs the boundary). */
function headersWithContentType(req: CodeRequest): Array<[string, string]> {
  const out = [...req.headers];
  if (hasHeader(req, 'content-type')) return out;
  if (req.body.kind === 'json') out.push(['Content-Type', 'application/json']);
  if (req.body.kind === 'text') out.push(['Content-Type', req.body.contentType]);
  if (req.body.kind === 'urlencoded') out.push(['Content-Type', 'application/x-www-form-urlencoded']);
  return out;
}

const urlencode = (pairs: Array<[string, string]>) => pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

// ── generators ──────────────────────────────────────────────────────────────

function curl(req: CodeRequest): string {
  const parts = [`curl -X ${req.method} ${shell(req.url)}`];
  const headers = req.body.kind === 'form' ? req.headers.filter(([k]) => k.toLowerCase() !== 'content-type') : headersWithContentType(req);
  for (const [k, v] of headers) parts.push(`  -H ${shell(`${k}: ${v}`)}`);
  const b = req.body;
  if (b.kind === 'json' || b.kind === 'text') parts.push(`  --data-raw ${shell(b.text)}`);
  if (b.kind === 'urlencoded') for (const [k, v] of b.pairs) parts.push(`  --data-urlencode ${shell(`${k}=${v}`)}`);
  if (b.kind === 'form') for (const f of b.fields) parts.push(`  -F ${shell(f.fileName ? `${f.key}=@${f.fileName}` : `${f.key}=${f.value}`)}`);
  return parts.join(' \\\n');
}

function jsHeaders(headers: Array<[string, string]>, indent: string) {
  if (!headers.length) return '{}';
  return `{\n${headers.map(([k, v]) => `${indent}  ${lit(k)}: ${lit(v)},`).join('\n')}\n${indent}}`;
}

function jsBodyPrelude(b: CodeBody): string {
  if (b.kind === 'urlencoded') return `const body = new URLSearchParams();\n${b.pairs.map(([k, v]) => `body.append(${lit(k)}, ${lit(v)});`).join('\n')}\n\n`;
  if (b.kind === 'form') {
    return `const body = new FormData();\n${b.fields.map(f => f.fileName
      ? `body.append(${lit(f.key)}, fileInput.files[0], ${lit(f.fileName)}); // pick the file`
      : `body.append(${lit(f.key)}, ${lit(f.value)});`).join('\n')}\n\n`;
  }
  return '';
}

function jsBodyExpr(b: CodeBody): string | null {
  if (b.kind === 'json') {
    const p = parsedJson(b.text);
    return p.ok ? `JSON.stringify(${JSON.stringify(p.value, null, 2).replace(/\n/g, '\n  ')})` : lit(b.text);
  }
  if (b.kind === 'text') return lit(b.text);
  if (b.kind === 'urlencoded' || b.kind === 'form') return 'body';
  return null;
}

function fetchCode(req: CodeRequest): string {
  const headers = req.body.kind === 'form' ? req.headers.filter(([k]) => k.toLowerCase() !== 'content-type') : headersWithContentType(req);
  const bodyExpr = jsBodyExpr(req.body);
  return `${jsBodyPrelude(req.body)}const response = await fetch(${lit(req.url)}, {
  method: ${lit(req.method)},
  headers: ${jsHeaders(headers, '  ')},${bodyExpr ? `\n  body: ${bodyExpr},` : ''}
});
console.log(await response.text());`;
}

function axiosCode(req: CodeRequest): string {
  const headers = req.body.kind === 'form' ? req.headers.filter(([k]) => k.toLowerCase() !== 'content-type') : headersWithContentType(req);
  let data: string | null = null;
  if (req.body.kind === 'json') {
    const p = parsedJson(req.body.text);
    data = p.ok ? JSON.stringify(p.value, null, 2).replace(/\n/g, '\n  ') : lit(req.body.text);
  } else if (req.body.kind === 'text') data = lit(req.body.text);
  else if (req.body.kind === 'urlencoded' || req.body.kind === 'form') data = 'body';
  return `import axios from 'axios';

${jsBodyPrelude(req.body)}const response = await axios({
  method: ${lit(req.method.toLowerCase())},
  url: ${lit(req.url)},
  headers: ${jsHeaders(headers, '  ')},${data ? `\n  data: ${data},` : ''}
});
console.log(response.data);`;
}

function pyDict(pairs: Array<[string, string]>, indent: string) {
  if (!pairs.length) return '{}';
  return `{\n${pairs.map(([k, v]) => `${indent}    ${lit(k)}: ${lit(v)},`).join('\n')}\n${indent}}`;
}

function pyBody(b: CodeBody): { prelude: string; arg: string | null; imports: string[] } {
  if (b.kind === 'json') {
    const p = parsedJson(b.text);
    return p.ok
      ? { prelude: `payload = json.loads(${lit(b.text)})\n`, arg: 'json=payload', imports: ['json'] }
      : { prelude: `payload = ${lit(b.text)}\n`, arg: 'data=payload', imports: [] };
  }
  if (b.kind === 'text') return { prelude: `payload = ${lit(b.text)}\n`, arg: 'data=payload', imports: [] };
  if (b.kind === 'urlencoded') return { prelude: `payload = [\n${b.pairs.map(([k, v]) => `    (${lit(k)}, ${lit(v)}),`).join('\n')}\n]\n`, arg: 'data=payload', imports: [] };
  if (b.kind === 'form') {
    // (None, value) makes a plain text part, so the body is multipart even
    // when there is no file in it — the same thing Send produces.
    const lines = b.fields.map(f => f.fileName
      ? `    (${lit(f.key)}, (${lit(f.fileName)}, open(${lit(f.fileName)}, "rb"))),`
      : `    (${lit(f.key)}, (None, ${lit(f.value)})),`);
    return { prelude: `files = [\n${lines.join('\n')}\n]\n`, arg: 'files=files', imports: [] };
  }
  return { prelude: '', arg: null, imports: [] };
}

function pythonRequests(req: CodeRequest): string {
  const headers = req.body.kind === 'form' ? req.headers.filter(([k]) => k.toLowerCase() !== 'content-type') : headersWithContentType(req);
  const b = pyBody(req.body);
  return `${['requests', ...b.imports].map(m => `import ${m}`).join('\n')}

headers = ${pyDict(headers, '')}
${b.prelude}
response = requests.request(
    ${lit(req.method)},
    ${lit(req.url)},
    headers=headers,${b.arg ? `\n    ${b.arg},` : ''}
)
print(response.text)`;
}

function pythonHttpx(req: CodeRequest): string {
  const headers = req.body.kind === 'form' ? req.headers.filter(([k]) => k.toLowerCase() !== 'content-type') : headersWithContentType(req);
  const b = pyBody(req.body);
  // httpx wants raw text bodies as content=, not data=.
  const arg = b.arg?.startsWith('data=') && req.body.kind !== 'urlencoded' ? b.arg.replace('data=', 'content=') : b.arg;
  return `${['httpx', ...b.imports].map(m => `import ${m}`).join('\n')}

headers = ${pyDict(headers, '')}
${b.prelude}
with httpx.Client() as client:
    response = client.request(
        ${lit(req.method)},
        ${lit(req.url)},
        headers=headers,${arg ? `\n        ${arg},` : ''}
    )
    print(response.text)`;
}

function goCode(req: CodeRequest): string {
  const b = req.body;
  const imports = new Set(['fmt', 'io', 'net/http']);
  let prelude = '';
  let bodyArg = 'nil';
  let extraHeader = '';
  if (b.kind === 'json' || b.kind === 'text') {
    imports.add('strings');
    prelude = `    body := strings.NewReader(${lit(b.text)})\n`;
    bodyArg = 'body';
  } else if (b.kind === 'urlencoded') {
    imports.add('strings');
    prelude = `    body := strings.NewReader(${lit(urlencode(b.pairs))})\n`;
    bodyArg = 'body';
  } else if (b.kind === 'form') {
    imports.add('bytes');
    imports.add('mime/multipart');
    const lines = ['    var buf bytes.Buffer', '    form := multipart.NewWriter(&buf)'];
    let n = 0;
    for (const f of b.fields) {
      if (f.fileName) {
        imports.add('os');
        n++;
        lines.push(`    part${n}, _ := form.CreateFormFile(${lit(f.key)}, ${lit(f.fileName)})`, `    file${n}, _ := os.Open(${lit(f.fileName)})`, `    io.Copy(part${n}, file${n})`, `    file${n}.Close()`);
      } else {
        lines.push(`    form.WriteField(${lit(f.key)}, ${lit(f.value)})`);
      }
    }
    lines.push('    form.Close()');
    prelude = lines.join('\n') + '\n';
    bodyArg = '&buf';
    extraHeader = '    req.Header.Set("Content-Type", form.FormDataContentType())\n';
  }
  const headers = b.kind === 'form' ? req.headers.filter(([k]) => k.toLowerCase() !== 'content-type') : headersWithContentType(req);
  return `package main

import (
${[...imports].sort().map(i => `    "${i}"`).join('\n')}
)

func main() {
${prelude}    req, _ := http.NewRequest(${lit(req.method)}, ${lit(req.url)}, ${bodyArg})
${headers.map(([k, v]) => `    req.Header.Set(${lit(k)}, ${lit(v)})`).join('\n')}${headers.length ? '\n' : ''}${extraHeader}
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    data, _ := io.ReadAll(resp.Body)
    fmt.Println(string(data))
}`;
}

function csharpCode(req: CodeRequest): string {
  const m = req.method.toUpperCase();
  const known = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  const methodExpr = known.includes(m) ? `HttpMethod.${m[0] + m.slice(1).toLowerCase()}` : `new HttpMethod(${lit(m)})`;
  // Content headers (Content-Type) belong to the content in HttpClient;
  // request.Headers.Add("Content-Type", ...) throws at runtime.
  const userContentType = req.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1];
  const headers = req.headers.filter(([k]) => k.toLowerCase() !== 'content-type');
  const b = req.body;
  let content = '';
  if (b.kind === 'json') content = `request.Content = new StringContent(${lit(b.text)}, Encoding.UTF8, ${lit(userContentType || 'application/json')});`;
  if (b.kind === 'text') content = `request.Content = new StringContent(${lit(b.text)}, Encoding.UTF8, ${lit(userContentType || b.contentType)});`;
  if (b.kind === 'urlencoded') content = `request.Content = new FormUrlEncodedContent(new[]\n{\n${b.pairs.map(([k, v]) => `    new KeyValuePair<string, string>(${lit(k)}, ${lit(v)}),`).join('\n')}\n});`;
  if (b.kind === 'form') {
    content = `var form = new MultipartFormDataContent();\n${b.fields.map(f => f.fileName
      ? `form.Add(new StreamContent(File.OpenRead(${lit(f.fileName)})), ${lit(f.key)}, ${lit(f.fileName)});`
      : `form.Add(new StringContent(${lit(f.value)}), ${lit(f.key)});`).join('\n')}\nrequest.Content = form;`;
  }
  return `using System.Net.Http;
using System.Text;

var client = new HttpClient();
var request = new HttpRequestMessage(${methodExpr}, ${lit(req.url)});
${headers.map(([k, v]) => `request.Headers.TryAddWithoutValidation(${lit(k)}, ${lit(v)});`).join('\n')}${headers.length ? '\n' : ''}${content}${content ? '\n' : ''}var response = await client.SendAsync(request);
var body = await response.Content.ReadAsStringAsync();
Console.WriteLine(body);`;
}

export function generateSnippet(language: Language, req: CodeRequest): string {
  switch (language) {
    case 'curl': return curl(req);
    case 'fetch': return fetchCode(req);
    case 'axios': return axiosCode(req);
    case 'python-requests': return pythonRequests(req);
    case 'python-httpx': return pythonHttpx(req);
    case 'go': return goCode(req);
    case 'csharp': return csharpCode(req);
    default: return '';
  }
}
