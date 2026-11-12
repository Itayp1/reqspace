/**
 * Postman / reqSpace collection format (v2.0 and v2.1) <-> this app's
 * collection model.
 *
 * Import used to keep only each request's name and bearer token and create
 * every request as `GET https://example.com`, so importing a file — including
 * one exported from this app — lost the URLs, methods, headers, bodies,
 * scripts and the whole folder tree.
 */

export type AuthShape = { type: string; [k: string]: any };
export interface KV { key: string; value: string; enabled: boolean; description?: string; type?: string }

export interface ParsedRequest {
  kind: 'request';
  name: string;
  method: string;
  url: string;
  params: KV[];
  headers: KV[];
  auth: AuthShape;
  body: any;
  preRequestScript: string;
  testScript: string;
  description: string;
}

export interface ParsedFolder {
  kind: 'folder';
  name: string;
  description: string;
  auth: AuthShape;
  preRequestScript: string;
  testScript: string;
  items: Array<ParsedFolder | ParsedRequest>;
}

export interface ParsedCollection {
  name: string;
  description: string;
  variables: Array<{ key: string; value: string; enabled: boolean }>;
  auth: AuthShape;
  preRequestScript: string;
  testScript: string;
  items: Array<ParsedFolder | ParsedRequest>;
}

const RAW_LANGUAGES = new Set(['json', 'text', 'xml', 'html', 'javascript']);
const GENERATED_AUTH_HEADER = 'Generated from Auth tab';
export const MAX_IMPORT_ITEMS = 5000;

function str(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function description(v: unknown): string {
  if (v && typeof v === 'object' && 'content' in (v as any)) return str((v as any).content);
  return str(v);
}

function clip(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

function kvList(list: unknown): KV[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((i: any) => i && typeof i === 'object' && i.key != null && String(i.key) !== '')
    .map((i: any) => {
      const out: KV = { key: String(i.key), value: str(i.value), enabled: !i.disabled };
      const d = description(i.description);
      if (d) out.description = d;
      return out;
    });
}

function headerList(h: unknown): KV[] {
  if (typeof h === 'string') {
    return h.split(/\r?\n/).map(line => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim(), enabled: true };
    }).filter((x): x is KV => !!x && !!x.key);
  }
  return kvList(h);
}

/** v2.1 stores auth params as [{key, value}], v2.0 as a plain object. */
function authParams(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const p of raw) if (p && p.key != null) out[String(p.key)] = str(p.value);
    return out;
  }
  if (raw && typeof raw === 'object') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = str(v);
    return out;
  }
  return {};
}

/** `missing` is what an absent auth block means at this level of the tree. */
export function parseAuth(raw: any, missing: 'inherit' | 'none'): AuthShape {
  if (!raw || typeof raw !== 'object' || !raw.type) return { type: missing };
  const p = authParams(raw[raw.type]);
  switch (raw.type) {
    case 'noauth': return { type: 'none' };
    case 'inherit': return { type: 'inherit' };
    case 'bearer': return { type: 'bearer', bearer: { token: p.token ?? '' } };
    case 'basic': return { type: 'basic', basic: { username: p.username ?? '', password: p.password ?? '' } };
    case 'apikey': return { type: 'apikey', apikey: { key: p.key ?? '', value: p.value ?? '', in: p.in === 'query' ? 'query' : 'header' } };
    case 'oauth2': {
      const oauth2: Record<string, string> = { token: p.accessToken ?? p.token ?? '' };
      for (const k of ['clientId', 'clientSecret', 'authUrl', 'accessTokenUrl', 'scope']) if (p[k]) oauth2[k] = p[k];
      return { type: 'oauth2', oauth2 };
    }
    case 'ntlm': {
      const ntlm: Record<string, string> = {};
      for (const k of ['username', 'password', 'domain', 'workstation']) if (p[k]) ntlm[k] = p[k];
      return { type: 'ntlm', ntlm };
    }
    // Digest, Hawk, AWS and the rest have no equivalent here.
    default: return { type: 'none' };
  }
}

function scriptOf(events: unknown, listen: 'prerequest' | 'test'): string {
  if (!Array.isArray(events)) return '';
  const ev = events.find((e: any) => e && e.listen === listen && !e.disabled);
  const exec = ev?.script?.exec;
  if (Array.isArray(exec)) return exec.map(str).join('\n');
  return str(exec);
}

function parseUrl(raw: any): { url: string; params: KV[] } {
  if (typeof raw === 'string') {
    const q = raw.indexOf('?');
    const params: KV[] = q === -1 ? [] : raw.slice(q + 1).split('&').filter(Boolean).map(pair => {
      const [k, ...rest] = pair.split('=');
      let key = k, value = rest.join('=');
      try { key = decodeURIComponent(k); value = decodeURIComponent(value); } catch { /* keep as typed */ }
      return { key, value, enabled: true };
    }).filter(p => p.key);
    return { url: raw, params };
  }
  if (raw && typeof raw === 'object') {
    let url = str(raw.raw);
    if (!url) {
      const protocol = raw.protocol ? `${raw.protocol}://` : '';
      const host = Array.isArray(raw.host) ? raw.host.join('.') : str(raw.host);
      const port = raw.port ? `:${raw.port}` : '';
      const path = Array.isArray(raw.path) ? '/' + raw.path.map(str).join('/') : (raw.path ? `/${str(raw.path).replace(/^\//, '')}` : '');
      url = `${protocol}${host}${port}${path}`;
    }
    const params = kvList(raw.query);
    if (!str(raw.raw) && params.length) {
      const enabled = params.filter(p => p.enabled);
      if (enabled.length) url += '?' + enabled.map(p => `${p.key}=${p.value}`).join('&');
    }
    return { url, params };
  }
  return { url: '', params: [] };
}

function parseBody(raw: any): any {
  if (!raw || typeof raw !== 'object' || !raw.mode || raw.disabled) return { mode: 'none' };
  switch (raw.mode) {
    case 'raw': {
      const lang = String(raw.options?.raw?.language || '').toLowerCase();
      const text = str(raw.raw);
      let rawLanguage = RAW_LANGUAGES.has(lang) ? lang : 'text';
      if (!lang) {
        // Older exports carry no language; a body that parses as JSON was JSON.
        try { JSON.parse(text); rawLanguage = 'json'; } catch { /* plain text */ }
      }
      return { mode: 'raw', raw: text, rawLanguage };
    }
    case 'urlencoded':
      return { mode: 'urlencoded', urlencoded: kvList(raw.urlencoded) };
    case 'formdata':
      return {
        mode: 'form-data',
        formData: (Array.isArray(raw.formdata) ? raw.formdata : [])
          .filter((i: any) => i && i.key != null && String(i.key) !== '')
          .map((i: any) => i.type === 'file'
            // The file itself never travels in a collection file.
            ? { key: String(i.key), value: '', enabled: !i.disabled, type: 'file' }
            : { key: String(i.key), value: str(i.value), enabled: !i.disabled, type: 'text' }),
      };
    case 'graphql':
      return {
        mode: 'graphql',
        graphql: {
          query: str(raw.graphql?.query),
          variables: typeof raw.graphql?.variables === 'string' ? raw.graphql.variables : JSON.stringify(raw.graphql?.variables ?? {}, null, 2),
        },
      };
    default:
      return { mode: 'none' };
  }
}

function parseItems(items: unknown, counter: { n: number }): Array<ParsedFolder | ParsedRequest> {
  if (!Array.isArray(items)) return [];
  const out: Array<ParsedFolder | ParsedRequest> = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    if (++counter.n > MAX_IMPORT_ITEMS) throw new ImportError(`Collection is too large (more than ${MAX_IMPORT_ITEMS} items)`);
    const node: any = it;
    if (Array.isArray(node.item)) {
      out.push({
        kind: 'folder',
        name: clip(str(node.name) || 'Folder', 255),
        description: description(node.description),
        auth: parseAuth(node.auth, 'inherit'),
        preRequestScript: scriptOf(node.event, 'prerequest'),
        testScript: scriptOf(node.event, 'test'),
        items: parseItems(node.item, counter),
      });
      continue;
    }
    const r = typeof node.request === 'string' ? { url: node.request, method: 'GET' } : (node.request || {});
    const auth = parseAuth(r.auth, 'inherit');
    const { url, params } = parseUrl(r.url);
    let headers = headerList(r.header);
    // Exports made by this app used to add the auth as an extra header too;
    // keeping it alongside the auth block would send it twice.
    if (auth.type !== 'none' && auth.type !== 'inherit') headers = headers.filter(h => h.description !== GENERATED_AUTH_HEADER);
    out.push({
      kind: 'request',
      name: clip(str(node.name) || url || 'Request', 255),
      method: clip((str(r.method) || 'GET').toUpperCase(), 10),
      url,
      params,
      headers,
      auth,
      body: parseBody(r.body),
      preRequestScript: scriptOf(node.event, 'prerequest'),
      testScript: scriptOf(node.event, 'test'),
      description: description(r.description ?? node.description),
    });
  }
  return out;
}

export class ImportError extends Error {}

export function parsePostmanCollection(json: any): ParsedCollection {
  if (!json || typeof json !== 'object') throw new ImportError('Collection must be a JSON object');
  // Some exports wrap the collection: { collection: { info, item } }.
  const c = json.info || json.item ? json : (json.collection && typeof json.collection === 'object' ? json.collection : json);
  if (!c.info && !Array.isArray(c.item)) throw new ImportError('Not a Postman/reqSpace collection: expected "info" and "item"');
  const counter = { n: 0 };
  return {
    name: clip(str(c.info?.name) || 'Imported Collection', 255),
    description: description(c.info?.description ?? c.description),
    variables: (Array.isArray(c.variable) ? c.variable : [])
      .filter((v: any) => v && v.key != null && String(v.key) !== '')
      .map((v: any) => ({ key: String(v.key), value: str(v.value), enabled: !v.disabled })),
    auth: parseAuth(c.auth, 'none'),
    preRequestScript: scriptOf(c.event, 'prerequest'),
    testScript: scriptOf(c.event, 'test'),
    items: parseItems(c.item, counter),
  };
}

// ── Export ──────────────────────────────────────────────────────────────────

const STRIPPED = 'STRIPPED';

function kvOut(obj: Record<string, unknown>) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => ({ key, value: String(value), type: 'string' }));
}

export function exportAuth(auth: AuthShape | undefined, includeSecrets: boolean): any {
  if (!auth || !auth.type || auth.type === 'inherit') return undefined;
  const secret = (v: unknown) => (v ? (includeSecrets ? v : STRIPPED) : v);
  switch (auth.type) {
    case 'none': return { type: 'noauth' };
    case 'bearer': return { type: 'bearer', bearer: kvOut({ token: secret(auth.bearer?.token) }) };
    case 'basic': return { type: 'basic', basic: kvOut({ username: auth.basic?.username, password: secret(auth.basic?.password) }) };
    case 'apikey': return { type: 'apikey', apikey: kvOut({ key: auth.apikey?.key, value: secret(auth.apikey?.value), in: auth.apikey?.in || 'header' }) };
    case 'oauth2': return { type: 'oauth2', oauth2: kvOut({ accessToken: secret(auth.oauth2?.token), clientId: auth.oauth2?.clientId, clientSecret: secret(auth.oauth2?.clientSecret), authUrl: auth.oauth2?.authUrl, accessTokenUrl: auth.oauth2?.accessTokenUrl, scope: auth.oauth2?.scope }) };
    case 'ntlm': return { type: 'ntlm', ntlm: kvOut({ username: auth.ntlm?.username, password: secret(auth.ntlm?.password), domain: auth.ntlm?.domain, workstation: auth.ntlm?.workstation }) };
    default: return { type: auth.type };
  }
}

function eventsOut(pre?: string, test?: string) {
  const ev: any[] = [];
  if (pre) ev.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre.split('\n') } });
  if (test) ev.push({ listen: 'test', script: { type: 'text/javascript', exec: test.split('\n') } });
  return ev.length ? ev : undefined;
}

function kvItemsOut(list: any[] | undefined) {
  return (list || []).filter(i => i && i.key).map(i => {
    const out: any = { key: i.key, value: i.value ?? '' };
    if (i.description) out.description = i.description;
    if (i.enabled === false) out.disabled = true;
    return out;
  });
}

function bodyOut(body: any) {
  if (!body || !body.mode || body.mode === 'none') return undefined;
  switch (body.mode) {
    case 'raw': return { mode: 'raw', raw: body.raw ?? '', options: { raw: { language: body.rawLanguage || 'text' } } };
    case 'urlencoded': return { mode: 'urlencoded', urlencoded: kvItemsOut(body.urlencoded) };
    case 'form-data': return {
      mode: 'formdata',
      formdata: (body.formData || []).filter((i: any) => i && i.key).map((i: any) => {
        const out: any = { key: i.key, value: i.value ?? '', type: i.type === 'file' ? 'file' : 'text' };
        if (i.enabled === false) out.disabled = true;
        return out;
      }),
    };
    case 'graphql': return { mode: 'graphql', graphql: { query: body.graphql?.query ?? '', variables: body.graphql?.variables ?? '' } };
    default: return undefined;
  }
}

function urlOut(url: string, params: any[] | undefined) {
  const out: any = { raw: url || '' };
  try {
    const parsed = new URL(url);
    out.protocol = parsed.protocol.replace(':', '');
    out.host = parsed.hostname.split('.');
    if (parsed.port) out.port = parsed.port;
    out.path = parsed.pathname.split('/').filter(Boolean);
  } catch { /* {{baseUrl}}/path and friends: raw only */ }
  const query = kvItemsOut(params);
  if (query.length) out.query = query;
  return out;
}

export function toPostmanCollection(
  collection: any,
  folders: any[],
  requests: any[],
  opts: { includeSecrets: boolean },
) {
  const byParent = (parentFolderId: string | null) => {
    const items: any[] = [];
    for (const f of folders.filter(x => (x.parentFolderId ?? null) === parentFolderId).sort((a, b) => (a.order || 0) - (b.order || 0))) {
      const node: any = { name: f.name, item: byParent(f._id) };
      if (f.description) node.description = f.description;
      const auth = exportAuth(f.auth, opts.includeSecrets);
      if (auth) node.auth = auth;
      const ev = eventsOut(f.preRequestScript, f.testScript);
      if (ev) node.event = ev;
      items.push(node);
    }
    for (const r of requests.filter(x => (x.folderId ?? null) === parentFolderId).sort((a, b) => (a.order || 0) - (b.order || 0))) {
      const request: any = {
        method: r.method || 'GET',
        header: kvItemsOut(r.headers),
        url: urlOut(r.url || '', r.params),
      };
      const auth = exportAuth(r.auth, opts.includeSecrets);
      if (auth) request.auth = auth;
      const body = bodyOut(r.body);
      if (body) request.body = body;
      if (r.description) request.description = r.description;
      const node: any = { name: r.name, request };
      const ev = eventsOut(r.preRequestScript, r.testScript);
      if (ev) node.event = ev;
      items.push(node);
    }
    return items;
  };

  const out: any = {
    info: {
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: byParent(null),
    variable: (collection.variables || []).filter((v: any) => v && v.key).map((v: any) => {
      const o: any = { key: v.key, value: v.value ?? '', type: 'string' };
      if (v.enabled === false) o.disabled = true;
      return o;
    }),
  };
  if (collection.description) out.info.description = collection.description;
  const auth = exportAuth(collection.auth, opts.includeSecrets);
  if (auth && auth.type !== 'noauth') out.auth = auth;
  const ev = eventsOut(collection.preRequestScript, collection.testScript);
  if (ev) out.event = ev;
  return out;
}
