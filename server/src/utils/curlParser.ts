// Parses a cURL command line into a request. The command is only tokenised,
// never executed, so `$(...)` and backticks stay plain text.

export interface ParsedCurl {
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: any;
  auth?: { type: 'basic'; basic: { username: string; password: string } };
}

/** Shell-like split: single/double quotes, $'..', backslash escapes and line continuations. */
export function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let has = false;
  let i = 0;
  const s = input.replace(/\\\r?\n/g, ' ');
  const ANSI: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"' };
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (has) { tokens.push(cur); cur = ''; has = false; }
      i++;
    } else if (c === "'") {
      has = true; i++;
      while (i < s.length && s[i] !== "'") cur += s[i++];
      i++;
    } else if (c === '$' && s[i + 1] === "'") {
      has = true; i += 2;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\' && i + 1 < s.length) { cur += ANSI[s[i + 1]] ?? s[i + 1]; i += 2; } else cur += s[i++];
      }
      i++;
    } else if (c === '"') {
      has = true; i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) { cur += s[i + 1]; i += 2; } else cur += s[i++];
      }
      i++;
    } else if (c === '\\' && i + 1 < s.length) {
      has = true; cur += s[i + 1]; i += 2;
    } else {
      has = true; cur += c; i++;
    }
  }
  if (has) tokens.push(cur);
  return tokens;
}

const WITH_VALUE: Record<string, string> = {
  '-X': 'request', '--request': 'request',
  '-H': 'header', '--header': 'header',
  '-d': 'data', '--data': 'data', '--data-raw': 'data', '--data-binary': 'data', '--data-ascii': 'data',
  '--data-urlencode': 'dataurlencode', '--json': 'json',
  '-F': 'form', '--form': 'form', '--form-string': 'formstring',
  '-u': 'user', '--user': 'user',
  '-b': 'cookie', '--cookie': 'cookie',
  '-A': 'useragent', '--user-agent': 'useragent',
  '-e': 'referer', '--referer': 'referer',
  '--url': 'url',
};
// Flags that take a value we do not use; the value must not be mistaken for the URL.
const IGNORED_WITH_VALUE = new Set(['-o', '--output', '-m', '--max-time', '--connect-timeout', '-x', '--proxy', '--cert', '--key', '--cacert', '-w', '--write-out', '-T', '--upload-file', '--retry', '-c', '--cookie-jar', '-K', '--config', '--resolve', '--max-redirs']);

export function parseCurl(curl: string): ParsedCurl {
  const tokens = tokenizeShell(curl.trim());
  if (tokens[0] && tokens[0].toLowerCase() === 'curl') tokens.shift();

  let method = '';
  let url = '';
  let head = false;
  let getMode = false;
  const headers: ParsedCurl['headers'] = [];
  const dataParts: string[] = [];
  const encodedParts: string[] = [];
  const formData: { key: string; value: string; enabled: boolean; type: 'text' | 'file' }[] = [];
  let json = false;
  let user: string | undefined;

  const addHeader = (str: string) => {
    const idx = str.indexOf(':');
    if (idx > 0) headers.push({ key: str.slice(0, idx).trim(), value: str.slice(idx + 1).trim(), enabled: true });
  };

  for (let i = 0; i < tokens.length; i++) {
    let tok = tokens[i];
    let attached: string | undefined;
    // -XPOST style: a short option with its value glued on.
    if (/^-[A-Za-z]./.test(tok) && WITH_VALUE[tok.slice(0, 2)]) {
      attached = tok.slice(2);
      tok = tok.slice(0, 2);
    }
    const kind = WITH_VALUE[tok];
    if (kind) {
      const val = attached ?? tokens[++i] ?? '';
      switch (kind) {
        case 'request': method = val.toUpperCase(); break;
        case 'header': addHeader(val); break;
        case 'data': dataParts.push(val); break;
        case 'dataurlencode': {
          const eq = val.indexOf('=');
          if (eq === -1) encodedParts.push(encodeURIComponent(val));
          else if (eq === 0) encodedParts.push(encodeURIComponent(val.slice(1)));
          else encodedParts.push(`${val.slice(0, eq)}=${encodeURIComponent(val.slice(eq + 1))}`);
          break;
        }
        case 'json': json = true; dataParts.push(val); break;
        case 'form': case 'formstring': {
          const eq = val.indexOf('=');
          if (eq > 0) {
            const key = val.slice(0, eq);
            const v = val.slice(eq + 1);
            if (kind === 'form' && v.startsWith('@')) formData.push({ key, value: '', enabled: true, type: 'file' });
            else formData.push({ key, value: v, enabled: true, type: 'text' });
          }
          break;
        }
        case 'user': user = val; break;
        case 'cookie': if (val.includes('=')) headers.push({ key: 'Cookie', value: val, enabled: true }); break;
        case 'useragent': headers.push({ key: 'User-Agent', value: val, enabled: true }); break;
        case 'referer': headers.push({ key: 'Referer', value: val, enabled: true }); break;
        case 'url': url = val; break;
      }
    } else if (tok === '-I' || tok === '--head') head = true;
    else if (tok === '-G' || tok === '--get') getMode = true;
    else if (IGNORED_WITH_VALUE.has(tok)) i++;
    else if (tok.startsWith('-') && tok.length > 1) { /* boolean flag: -k, -L, -s, --compressed, ... */ }
    else if (!url) url = tok;
  }

  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `http://${url}`;

  const allData = [...dataParts, ...encodedParts];
  if (json) {
    if (!headers.some(h => h.key.toLowerCase() === 'content-type')) headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
    if (!headers.some(h => h.key.toLowerCase() === 'accept')) headers.push({ key: 'Accept', value: 'application/json', enabled: true });
  }

  let body: any = { mode: 'none', raw: '' };
  if (getMode && allData.length) {
    url += (url.includes('?') ? '&' : '?') + allData.join('&');
  } else if (formData.length) {
    body = { mode: 'form-data', formData };
  } else if (allData.length) {
    const contentType = headers.find(h => h.key.toLowerCase() === 'content-type')?.value.toLowerCase() || '';
    if ((encodedParts.length && !dataParts.length) || contentType.includes('x-www-form-urlencoded')) {
      const dec = (x: string) => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } };
      const urlencoded = allData.join('&').split('&').filter(Boolean).map(pair => {
        const eq = pair.indexOf('=');
        return eq === -1 ? { key: dec(pair), value: '', enabled: true } : { key: dec(pair.slice(0, eq)), value: dec(pair.slice(eq + 1)), enabled: true };
      });
      body = { mode: 'urlencoded', urlencoded };
    } else {
      const raw = allData.join('&');
      let rawLanguage = 'text';
      try { JSON.parse(raw); rawLanguage = 'json'; } catch { /* plain text */ }
      body = { mode: 'raw', raw, rawLanguage };
    }
  }

  if (!method) {
    if (head) method = 'HEAD';
    else if (getMode) method = 'GET';
    else if (formData.length || allData.length) method = 'POST';
    else method = 'GET';
  }

  const result: ParsedCurl = { method, url, headers, body };
  if (user !== undefined) {
    const idx = user.indexOf(':');
    result.auth = { type: 'basic', basic: { username: idx === -1 ? user : user.slice(0, idx), password: idx === -1 ? '' : user.slice(idx + 1) } };
  }
  return result;
}
