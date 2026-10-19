import type { RequestAuth, RequestBody } from '../store/requestStore';

/**
 * Builds the body the request create/update endpoints accept. Tabs carry
 * client-only state (tabId, isDirty, a form-data row's File object, ids that
 * imports attached to header rows, ...) and the server schemas are strict, so
 * sending a tab as-is gets the save rejected.
 */

const RAW_LANGUAGES = new Set(['json', 'text', 'xml', 'html', 'javascript']);
const BODY_MODES = new Set(['none', 'raw', 'urlencoded', 'form-data', 'binary', 'graphql']);
const AUTH_TYPES = new Set(['none', 'basic', 'bearer', 'oauth2', 'apikey', 'ntlm', 'inherit']);

export interface CleanItem { key: string; value: string; enabled?: boolean; type?: string; description?: string }

export function cleanItems(items: unknown): CleanItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i: any) => i && typeof i.key === 'string')
    .map((i: any) => {
      const out: CleanItem = { key: i.key, value: i.value == null ? '' : String(i.value) };
      if (typeof i.enabled === 'boolean') out.enabled = i.enabled;
      if (typeof i.type === 'string') out.type = i.type;
      if (typeof i.description === 'string' && i.description) out.description = i.description;
      return out;
    });
}

export function cleanBody(body: Partial<RequestBody> | undefined | null): Record<string, unknown> {
  if (!body || !BODY_MODES.has(body.mode as string)) return { mode: 'none' };
  const out: Record<string, unknown> = { mode: body.mode };
  if (body.raw !== undefined && body.raw !== null) out.raw = typeof body.raw === 'string' ? body.raw : JSON.stringify(body.raw);
  if (body.rawLanguage && RAW_LANGUAGES.has(body.rawLanguage)) out.rawLanguage = body.rawLanguage;
  if (body.formData) out.formData = cleanItems(body.formData);
  if (body.urlencoded) out.urlencoded = cleanItems(body.urlencoded);
  if (body.graphql) out.graphql = { query: String(body.graphql.query ?? ''), variables: String(body.graphql.variables ?? '') };
  return out;
}

function strOrUndef(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}

export function cleanAuth(auth: Partial<RequestAuth> | undefined | null): Record<string, unknown> {
  if (!auth || !AUTH_TYPES.has(auth.type as string)) return { type: 'none' };
  const out: Record<string, unknown> = { type: auth.type };
  if (auth.bearer) out.bearer = { token: String(auth.bearer.token ?? ''), ...(auth.bearer.prefix?.trim() ? { prefix: auth.bearer.prefix.trim() } : {}) };
  if (auth.basic) out.basic = { username: String(auth.basic.username ?? ''), password: String(auth.basic.password ?? '') };
  if (auth.apikey) out.apikey = { key: String(auth.apikey.key ?? ''), value: String(auth.apikey.value ?? ''), in: auth.apikey.in === 'query' ? 'query' : 'header' };
  if (auth.oauth2) out.oauth2 = { ...auth.oauth2 };
  if (auth.ntlm) {
    const n: Record<string, string> = {};
    for (const k of ['username', 'password', 'domain', 'workstation'] as const) {
      const v = strOrUndef((auth.ntlm as any)[k]);
      if (v !== undefined) n[k] = v;
    }
    out.ntlm = n;
  }
  return out;
}

export interface RequestLike {
  name?: string;
  method?: string;
  url?: string;
  params?: unknown;
  headers?: unknown;
  auth?: Partial<RequestAuth> | null;
  body?: Partial<RequestBody> | null;
  preRequestScript?: string;
  testScript?: string;
  description?: string;
  settings?: Record<string, any> | null;
  tabType?: string;
  connection?: Record<string, any> | null;
}

/** Per-request settings overrides (+ the connection settings of a connection tab), cleaned for the server. */
export function cleanSettings(req: RequestLike): Record<string, unknown> {
  const s = req.settings ?? {};
  const out: Record<string, unknown> = {};
  if (typeof s.followRedirects === 'boolean') out.followRedirects = s.followRedirects;
  if (typeof s.verifySsl === 'boolean') out.verifySsl = s.verifySsl;
  if (typeof s.encodeUrl === 'boolean') out.encodeUrl = s.encodeUrl;
  if (typeof s.timeout === 'number' && Number.isFinite(s.timeout) && s.timeout >= 0) out.timeout = Math.trunc(s.timeout);
  if (req.tabType === 'connection' || s.connection) {
    // sioAuth may hold a token - never stored with the request.
    const { sioAuth: _omit, ...conn } = (req.connection ?? s.connection ?? {}) as Record<string, any>;
    out.connection = conn;
  }
  return out;
}

/** The request fields every create/update shares; callers add folderId etc. */
export function toRequestPayload(req: RequestLike) {
  const payload: Record<string, unknown> = {
    name: req.name || 'New Request',
    method: req.method || 'GET',
    url: req.url || '',
    params: cleanItems(req.params),
    headers: cleanItems(req.headers),
    auth: cleanAuth(req.auth),
    body: cleanBody(req.body),
    preRequestScript: req.preRequestScript || '',
    testScript: req.testScript || '',
    settings: cleanSettings(req),
  };
  if (typeof req.description === 'string') payload.description = req.description;
  return payload;
}
