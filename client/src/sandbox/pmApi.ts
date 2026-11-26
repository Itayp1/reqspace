// Postman-compatible pm.request / pm.response objects (subset of the postman-collection SDK) and the
// chai assertions behind pm.response.to.*. Runs inside the sandbox worker only.
import { use, expect, AssertionError } from 'chai';
import _ from 'lodash';
import Ajv from 'ajv';
import Ajv04 from 'ajv-draft-04';

const unsupported = (path: string): never => { throw new Error(`pm.${path} is not supported`); };
const isObj = (v: any) => v !== null && typeof v === 'object';
const bytes = (s: string) => new TextEncoder().encode(s).length;
const dis = (d: any) => !!(d.disabled ?? d.enabled === false);

// ---- items and lists ----
class Item {
  constructor(public key: any, public value: any, public disabled = false) {}
  toString() { return `${this.key}: ${this.value}`; }
  toJSON() { const o: any = { key: this.key, value: this.value }; if (this.disabled) o.disabled = true; return o; }
  update(v: any) { if (isObj(v)) { if ('key' in v) this.key = v.key; if ('value' in v) this.value = v.value; } else this.value = v; return this; }
  valueOf() { return this.value; }
}
class Header extends Item {}
class Param extends Item {
  type?: string;
  toString() { return this.value === null || this.value === undefined ? `${this.key}` : `${this.key}=${this.value}`; }
  toJSON() { const o = super.toJSON(); if (this.type) o.type = this.type; return o; }
}
class Cookie {
  constructor(public name: string, public value: string, public path?: string, public domain?: string, public expires?: Date, public httpOnly = false, public secure = false) {}
  get key() { return this.name; }
  toString() { return `${this.name}=${this.value}`; }
  toJSON() { return { name: this.name, value: this.value, path: this.path, domain: this.domain, expires: this.expires, httpOnly: this.httpOnly, secure: this.secure }; }
}

const mkHeader = (d: any): Header => {
  if (typeof d === 'string') { const i = d.indexOf(':'); return i < 0 ? new Header(d.trim(), '') : new Header(d.slice(0, i).trim(), d.slice(i + 1).trim()); }
  return new Header(d.key, d.value, dis(d));
};
const parseParam = (s: string) => { const i = s.indexOf('='); return i < 0 ? new Param(s, null) : new Param(s.slice(0, i), s.slice(i + 1)); };
const mkParam = (d: any): Param => {
  if (typeof d === 'string') return parseParam(d);
  const p = new Param(d.key, d.value === undefined ? null : d.value, dis(d));
  if (d.type) p.type = d.type;
  return p;
};
const mkPlain = (d: any) => new Item(d.key, d.value, dis(d));
const mkCookie = (d: any) => d as Cookie;

class List<T extends { key: any }> {
  items: T[] = [];
  constructor(private make: (d: any) => T, private ci: boolean, private label: string, private ro = false, private sep = '\r\n') {}
  private w() { if (this.ro) throw new Error(`${this.label} is read only`); }
  private same(a: any, b: any) { return this.ci ? String(a).toLowerCase() === String(b).toLowerCase() : a === b; }
  private k(x: any) { return isObj(x) ? x.key : x; }
  private last(name: any) { for (let i = this.items.length - 1; i >= 0; i--) if (this.same(this.items[i].key, this.k(name))) return i; return -1; }
  add(d: any) { this.w(); this.items.push(this.make(d)); }
  append(d: any) { this.add(d); }
  prepend(d: any) { this.w(); this.items.unshift(this.make(d)); }
  insert(d: any, before?: any) { this.w(); const i = before === undefined ? -1 : this.indexOf(before); if (i < 0) this.items.push(this.make(d)); else this.items.splice(i, 0, this.make(d)); }
  insertAfter(d: any, after: any) { this.w(); const i = this.indexOf(after); if (i < 0) this.items.push(this.make(d)); else this.items.splice(i + 1, 0, this.make(d)); }
  upsert(d: any) {
    this.w();
    const n: any = this.make(d), i = this.last(n.key);
    if (i < 0) this.items.push(n); else { (this.items[i] as any).value = n.value; (this.items[i] as any).disabled = n.disabled; }
  }
  remove(x: any) {
    this.w();
    const pred = typeof x === 'function' ? x : (i: T) => this.same(i.key, this.k(x));
    this.items = this.items.filter((i) => !pred(i));
  }
  clear() { this.w(); this.items = []; }
  populate(x: any) {
    this.w();
    const arr = Array.isArray(x) ? x : x instanceof List ? x.items : isObj(x) ? Object.entries(x).map(([key, value]) => ({ key, value })) : [];
    arr.forEach((d: any) => this.items.push(this.make(d)));
  }
  repopulate(x: any) { this.clear(); this.populate(x); }
  assimilate(x: any, prune?: boolean) {
    this.w();
    const arr = Array.isArray(x) ? x : x instanceof List ? x.items : isObj(x) ? Object.entries(x).map(([key, value]) => ({ key, value })) : [];
    const made = arr.map((d: any) => this.make(d));
    made.forEach((m: any) => this.upsert(m));
    if (prune) this.items = this.items.filter((i) => made.some((m: any) => this.same(m.key, i.key)));
  }
  get(name: any) { const i = this.last(name); return i < 0 ? undefined : (this.items[i] as any).value; }
  one(name: any) { const i = this.last(name); return i < 0 ? undefined : this.items[i]; }
  has(name: any, value?: any) { return this.items.some((i: any) => this.same(i.key, this.k(name)) && (value === undefined || i.value === value)); }
  all() { return [...this.items]; }
  idx(i: number) { return this.items[i]; }
  indexOf(x: any) { return this.items.findIndex((i) => this.same(i.key, this.k(x))); }
  count() { return this.items.length; }
  each(fn: any) { this.items.forEach(fn); }
  map(fn: any) { return this.items.map(fn); }
  filter(fn: any) { return this.items.filter(fn); }
  find(fn: any) { return this.items.find(fn); }
  reduce(fn: any, init?: any) { return arguments.length > 1 ? this.items.reduce(fn, init) : this.items.reduce(fn); }
  toObject(excludeDisabled = false, caseSensitive = false, multiValue = false, sanitizeKeys = false) {
    const out: Record<string, any> = {};
    for (const it of this.items as any[]) {
      if (excludeDisabled && it.disabled) continue;
      if (sanitizeKeys && (!it.key || typeof it.value !== 'string')) continue;
      const key = this.ci && !caseSensitive ? String(it.key).toLowerCase() : it.key;
      if (multiValue && key in out) out[key] = [].concat(out[key], it.value);
      else out[key] = multiValue ? [it.value] : it.value;
    }
    if (multiValue) for (const k of Object.keys(out)) if (out[k].length === 1) out[k] = out[k][0];
    return out;
  }
  toString() { return this.items.filter((i: any) => !i.disabled).map(String).join(this.sep); }
  contentSize() { return this.items.reduce((n, i) => n + String(i).length + 2, 0); }
  toJSON() { return this.items.map((i: any) => (i.toJSON ? i.toJSON() : i)); }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
}

// pm.request.headers['X-A'] = 'b' / ['X-A'] read keep working (they did when headers was a plain object).
const headerList = (label: string, ro = false) => {
  const list = new List(mkHeader, true, label, ro);
  return new Proxy(list, {
    get: (t, p, r) => (typeof p === 'string' && !(p in t) ? t.get(p) : Reflect.get(t, p, r)),
    set: (t, p, v) => { if (typeof p === 'string' && !(p in t)) { t.upsert({ key: p, value: String(v) }); return true; } return Reflect.set(t, p, v); },
    // Object.keys(headers) lists header names, as it did when headers was a plain object.
    ownKeys: (t) => [...new Set(t.items.map((i: any) => String(i.key)))],
    getOwnPropertyDescriptor: (t, p) => (typeof p === 'string' && t.has(p) ? { value: t.get(p), enumerable: true, configurable: true, writable: true } : undefined),
    deleteProperty: (t, p) => { if (typeof p === 'string' && !(p in t)) t.remove(p); return true; },
  });
};
const paramList = (label: string) => new List(mkParam, false, label, false, '&');

// ---- Url ----
const URL_RE = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(?:([^:@/?#]*)(?::([^@/?#]*))?@)?([^:/?#]*)(?::(\d+|\{\{[^}]*\}\}))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i;
const splitPath = (p: string) => (p === '' ? [] : p.replace(/^\//, '').split('/'));
const qsItems = (qs: string) => (qs === '' ? [] : qs.split('&').map(parseParam));

class Url {
  protocol?: string; auth?: { user: string; password?: string }; host: string[] = []; port?: string; path: string[] = []; hash?: string;
  query = paramList('url.query');
  variables = new List(mkPlain, false, 'url.variables');
  constructor(u?: any) { if (u !== undefined) this.update(u); }
  update(u: any) {
    if (typeof u === 'string') {
      const m = URL_RE.exec(u)!;
      this.protocol = m[1]; this.auth = m[2] !== undefined ? { user: m[2], password: m[3] } : undefined;
      this.host = m[4] ? m[4].split('.') : []; this.port = m[5]; this.path = splitPath(m[6] || '');
      this.query.items = m[7] === undefined ? [] : qsItems(m[7]); this.hash = m[8];
    } else if (isObj(u)) {
      if ('protocol' in u) this.protocol = u.protocol;
      if ('auth' in u) this.auth = u.auth;
      if ('host' in u) this.host = Array.isArray(u.host) ? [...u.host] : String(u.host).split('.');
      if ('port' in u) this.port = u.port === undefined ? undefined : String(u.port);
      if ('path' in u) this.path = Array.isArray(u.path) ? [...u.path] : splitPath(String(u.path));
      if ('hash' in u) this.hash = u.hash;
      if ('query' in u) { this.query.items = []; this.addQueryParams(u.query); }
      if ('variable' in u) this.variables.repopulate(u.variable);
    }
    return this;
  }
  addQueryParams(p: any) { this.query.populate(typeof p === 'string' ? qsItems(p) : p); }
  removeQueryParams(p: any) { (typeof p === 'string' ? [p] : p).forEach((x: any) => this.query.remove(isObj(x) ? x.key : x)); }
  getHost() { return this.host.join('.'); }
  getPath() { return '/' + this.path.join('/'); }
  getQueryString() { return this.query.toString(); }
  getPathWithQuery() { const q = this.getQueryString(); return this.getPath() + (q ? '?' + q : ''); }
  getRemote(forcePort?: boolean) { return this.getHost() + (this.port ? ':' + this.port : forcePort ? ':' + (this.protocol === 'https' ? 443 : 80) : ''); }
  getRaw() { return this.toString(); }
  toString(forceProtocol?: boolean) {
    const proto = this.protocol || (forceProtocol ? 'http' : '');
    const a = this.auth ? this.auth.user + (this.auth.password !== undefined ? ':' + this.auth.password : '') + '@' : '';
    const path = this.path.length ? '/' + this.path.join('/') : '';
    const q = this.getQueryString();
    return (proto ? proto + '://' : '') + a + this.getRemote() + path + (q ? '?' + q : '') + (this.hash ? '#' + this.hash : '');
  }
  toJSON() {
    return { raw: this.toString(), protocol: this.protocol, host: this.host, path: this.path, port: this.port, hash: this.hash, query: this.query.toJSON(), variable: this.variables.toJSON() };
  }
}

// ---- body, auth, request ----
class Body {
  mode?: string; raw?: string; graphql?: any; options?: any; disabled = false;
  urlencoded = paramList('body.urlencoded'); formdata = paramList('body.formdata');
  constructor(def?: any) { if (def !== undefined) this.update(def); }
  update(o: any) {
    if (typeof o === 'string') { this.mode = 'raw'; this.raw = o; return this; }
    if (!isObj(o)) return this;
    if ('mode' in o) this.mode = o.mode === 'form-data' ? 'formdata' : o.mode;
    if ('raw' in o) { this.raw = o.raw; if (!this.mode) this.mode = 'raw'; }
    if ('urlencoded' in o) this.urlencoded.repopulate(o.urlencoded);
    const fd = o.formdata ?? o.formData;
    if (fd) this.formdata.repopulate(fd);
    if ('graphql' in o) this.graphql = o.graphql;
    if ('options' in o) this.options = o.options;
    else if (o.rawLanguage) this.options = { raw: { language: o.rawLanguage } };
    if ('disabled' in o) this.disabled = !!o.disabled;
    return this;
  }
  isEmpty() {
    switch (this.mode) {
      case 'raw': return !this.raw;
      case 'urlencoded': return !this.urlencoded.count();
      case 'formdata': return !this.formdata.count();
      case 'graphql': return !this.graphql?.query;
      default: return true;
    }
  }
  toString() {
    if (this.mode === 'raw') return this.raw ?? '';
    if (this.mode === 'urlencoded') return this.urlencoded.toString();
    if (this.mode === 'graphql') return JSON.stringify({ query: this.graphql?.query, variables: this.graphql?.variables });
    return '';
  }
  toJSON() {
    const o: any = { mode: this.mode, raw: this.raw, graphql: this.graphql, options: this.options, disabled: this.disabled };
    if (this.urlencoded.count()) o.urlencoded = this.urlencoded.toJSON();
    if (this.formdata.count()) o.formdata = this.formdata.toJSON();
    return _.omitBy(o, _.isUndefined);
  }
}

class Auth {
  [k: string]: any;
  constructor(public type: string, params: any = {}) {
    const l = new List(mkPlain, false, 'auth.parameters');
    l.populate(params);
    Object.defineProperty(this, 'params', { value: l, enumerable: false });
    this[type] = l;
  }
  parameters() { return this.params as List<Item>; }
  toJSON() { return { type: this.type, [this.type]: this.params.toJSON() }; }
}

class Req {
  id: string; name: string; method: string; description?: any; disabled = false;
  private _url: Url; private _headers: any; body: Body; auth?: Auth;
  constructor(i: { id?: string; name?: string; method?: string; url?: any; headers?: any; body?: any; auth?: any }) {
    this.id = i.id ?? ''; this.name = i.name ?? ''; this.method = i.method || 'GET';
    this._url = new Url(i.url ?? ''); this._headers = headerList('pm.request.headers'); this._headers.populate(i.headers);
    this.body = new Body(i.body);
    if (i.auth?.type && i.auth.type !== 'none' && i.auth.type !== 'inherit') this.auth = new Auth(i.auth.type, i.auth[i.auth.type]);
  }
  get url(): Url { return this._url; }
  set url(v: any) { this._url = new Url(isObj(v) && !(v instanceof Url) ? v : String(v)); if (v instanceof Url) this._url.update(v.toJSON()); }
  get headers() { return this._headers; }
  set headers(v: any) { this._headers.repopulate(v); }
  addHeader(h: any) { this._headers.add(h); }
  upsertHeader(h: any) { this._headers.upsert(h); }
  removeHeader(h: any, o?: { ignoreCase?: boolean }) {
    const name = isObj(h) ? h.key : h;
    this._headers.remove(o?.ignoreCase === false ? (i: Header) => i.key === name : name);
  }
  forEachHeader(cb: any) { this._headers.each(cb); }
  getHeaders(o: any = {}) { return this._headers.toObject(o.enabled !== false, o.ignoreCase === false, !!o.multiValue, !!o.sanitizeKeys); }
  addQueryParams(p: any) { this._url.addQueryParams(p); }
  removeQueryParams(p: any) { this._url.removeQueryParams(p); }
  authorizeUsing(type: string, opts?: any) { this.auth = type ? new Auth(type, opts) : undefined; }
  update(d: any) {
    if (d.url !== undefined) this._url.update(d.url);
    if (d.method) this.method = d.method;
    if (d.header) this._headers.repopulate(d.header);
    if (d.body !== undefined) this.body.update(d.body);
    return this;
  }
  clone() {
    return new Req({ id: this.id, name: this.name, method: this.method, url: this._url.toString(), headers: this._headers.toJSON(), body: this.body.toJSON(), auth: this.auth && { type: this.auth.type, [this.auth.type]: this.auth.parameters().toJSON() } });
  }
  size() {
    const header = `${this.method} ${this._url.getPathWithQuery()} HTTP/1.1\r\n`.length + this._headers.contentSize() + 2;
    const body = bytes(this.body.toString());
    return { header, body, total: header + body, source: 'REQUEST' };
  }
  toJSON() { return { method: this.method, url: this._url.toJSON(), header: this._headers.toJSON(), body: this.body.toJSON() }; }
  describe(content: any, type?: string) { this.description = { content, type }; }
  parent() { return undefined; }
  get proxy(): never { return unsupported('request.proxy'); }
  get certificate(): never { return unsupported('request.certificate'); }
  get meta(): never { return unsupported('request.meta'); }
  findInParents(): never { return unsupported('request.findInParents'); }
  forEachParent(): never { return unsupported('request.forEachParent'); }
}

// ---- response ----
const parseCookie = (s: string): Cookie => {
  const [first, ...attrs] = s.split(';');
  const i = first.indexOf('=');
  const c = new Cookie(i < 0 ? '' : first.slice(0, i).trim(), i < 0 ? first.trim() : first.slice(i + 1).trim());
  for (const a of attrs) {
    const j = a.indexOf('='), n = (j < 0 ? a : a.slice(0, j)).trim().toLowerCase(), v = j < 0 ? '' : a.slice(j + 1).trim();
    if (n === 'path') c.path = v; else if (n === 'domain') c.domain = v; else if (n === 'httponly') c.httpOnly = true;
    else if (n === 'secure') c.secure = true; else if (n === 'expires' && !isNaN(Date.parse(v))) c.expires = new Date(v);
  }
  return c;
};
const EXT: Record<string, string> = { json: 'json', xml: 'xml', html: 'html', plain: 'txt', css: 'css', javascript: 'js', csv: 'csv' };

class Resp {
  code: number; status: string; responseTime: number; responseSize: number; body: any;
  headers: any; cookies = new List(mkCookie, false, 'pm.response.cookies', true);
  constructor(r: any, public originalRequest?: Req) {
    this.code = r.code; this.status = r.status; this.responseTime = r.responseTime; this.body = r.body;
    this.headers = headerList('pm.response.headers', false);
    for (const [k, v] of Object.entries(r.headers || {})) [].concat(v as any).forEach((x) => this.headers.add({ key: k, value: String(x) }));
    this.headers.ro = true; // not through the Proxy: the flag is a list field
    this.cookies.items = this.headers.filter((h: Header) => h.key.toLowerCase() === 'set-cookie').map((h: Header) => parseCookie(h.value));
    this.responseSize = bytes(this.text());
  }
  reason() { return this.status; }
  text(): string { return typeof this.body === 'string' ? this.body : JSON.stringify(this.body); }
  json(reviver?: any) { return JSON.parse(this.text(), reviver); }
  jsonp(cb?: string, reviver?: any) {
    const m = /^\s*([\w$.]+)\(([\s\S]*)\)\s*;?\s*$/.exec(this.text());
    if (!m) return this.json(reviver);
    if (cb && cb !== m[1]) throw new Error(`jsonp callback "${m[1]}" does not match "${cb}"`);
    return JSON.parse(m[2], reviver);
  }
  size() {
    const header = `HTTP/1.1 ${this.code} ${this.status}\r\n`.length + this.headers.contentSize() + 2;
    return { header, body: this.responseSize, total: header + this.responseSize };
  }
  contentInfo() {
    const contentType = this.headers.get('content-type') || '';
    const [mimeType, ...params] = contentType.split(';').map((s: string) => s.trim());
    const sub = (mimeType.split('/')[1] || '').split('+').pop() || '';
    const charset = (params.map((p: string) => /^charset=(.*)$/i.exec(p)).find(Boolean) || [])[1] || 'utf8';
    const fileExtension = EXT[sub] || sub;
    const fileName = /filename="?([^";]+)"?/i.exec(this.headers.get('content-disposition') || '')?.[1] || (fileExtension ? `response.${fileExtension}` : 'response');
    return { mimeType, mimeFormat: sub, charset, fileExtension, fileName, contentType };
  }
  dataURI() {
    let bin = ''; new TextEncoder().encode(this.text()).forEach((b) => { bin += String.fromCharCode(b); });
    return `data:${this.contentInfo().mimeType};base64,${btoa(bin)}`;
  }
  get stream() { return new TextEncoder().encode(this.text()); }
  toJSON() { return { code: this.code, status: this.status, header: this.headers.toJSON(), body: this.text(), responseTime: this.responseTime, cookie: this.cookies.toJSON() }; }
}

// ---- chai assertions (pm.response.to.* / pm.request.to.*), behaviour of the chai-postman plugin ----
// Deviation from chai-postman: status shortcuts (ok, notFound, ...) compare the status code only, not the reason text.
use((chai: any, utils: any) => {
  const A = chai.Assertion;
  const resp = (a: any): Resp => { if (!(a._obj instanceof Resp)) throw new AssertionError('expected a Postman response'); return a._obj; };
  const classes: Record<string, number> = { info: 1, success: 2, redirection: 3, clientError: 4, serverError: 5 };
  for (const [n, k] of Object.entries(classes)) {
    A.addProperty(n, function (this: any) { const c = resp(this).code; this.assert(Math.floor(c / 100) === k, `expected response code to be ${k}XX but found ${c}`, `expected response code to not be ${k}XX`, k, c); });
  }
  A.addProperty('error', function (this: any) { const c = resp(this).code, k = Math.floor(c / 100); this.assert(k === 4 || k === 5, `expected response code to be 4XX or 5XX but found ${c}`, 'expected response code to not be 4XX or 5XX', null, c); });
  const codes: Record<string, number> = { accepted: 202, withoutContent: 204, badRequest: 400, unauthorised: 401, unauthorized: 401, forbidden: 403, notFound: 404, notAcceptable: 406, rateLimited: 429 };
  for (const [n, k] of Object.entries(codes)) {
    A.addProperty(n, function (this: any) { const c = resp(this).code; this.assert(c === k, `expected response to have status code ${k} but got ${c}`, `expected response to not have status code ${c}`, k, c); });
  }
  A.overwriteProperty('ok', (_super: any) => function (this: any) {
    if (!(this._obj instanceof Resp)) return _super.call(this);
    const c = this._obj.code;
    this.assert(c === 200, `expected response to have status code 200 but got ${c}`, 'expected response to not have status code 200', 200, c);
  });
  A.addMethod('statusCodeClass', function (this: any, k: number) { const c = resp(this).code; this.assert(Math.floor(c / 100) === k, `expected response code to be ${k}XX but found ${c}`, `expected response code to not be ${k}XX`, k, c); });
  A.addMethod('statusCode', function (this: any, k: any) { const c = resp(this).code; this.assert(c === Number(k), `expected response to have status code ${k} but got ${c}`, `expected response to not have status code ${c}`, Number(k), c); });
  A.addMethod('statusReason', function (this: any, s: any) { const r = resp(this).reason(); this.assert(r === String(s), `expected response to have status reason ${s} but got ${r}`, `expected response to not have status reason ${r}`, String(s), r); });
  A.addMethod('status', function (this: any, v: any) {
    const o = resp(this);
    if (typeof v === 'number') this.assert(o.code === v, `expected response to have status code ${v} but got ${o.code}`, `expected response to not have status code ${o.code}`, v, o.code);
    else this.assert(o.reason() === v, `expected response to have status reason ${v} but got ${o.reason()}`, `expected response to not have status reason ${o.reason()}`, v, o.reason());
  });
  A.addMethod('header', function (this: any, key: string, ...val: any[]) {
    const o = this._obj;
    if (!(o instanceof Resp || o instanceof Req)) throw new AssertionError('expected a Postman request or response');
    const what = o instanceof Req ? 'request' : 'response';
    this.assert(o.headers.has(key), `expected ${what} to have header with key '${key}'`, `expected ${what} to not have header with key '${key}'`, true, o.headers.has(key));
    if (val.length) { const a = o.headers.one(key)?.value; this.assert(a === val[0], `expected '${key}' ${what} header to be ${JSON.stringify(val[0])} but got ${JSON.stringify(a)}`, `expected '${key}' ${what} header to not be ${JSON.stringify(a)}`, val[0], a); }
  });
  const hasBody = function (this: any) { const t = resp(this).text(); this.assert(_.isString(t) && t.length > 0, 'expected response to have content in body', 'expected response to not have content in body'); };
  A.addProperty('withBody', hasBody);
  const jsonErr = (o: Resp) => { try { o.json(); return ''; } catch (e: any) { return `${e.name}: ${e.message}`; } };
  A.addProperty('json', function (this: any) { const e = jsonErr(resp(this)); this.assert(!e, `expected response body to be a valid json but got error ${e}`, 'expected response body not to be a valid json'); });
  A.addMethod('body', function (this: any, ...a: any[]) {
    const o = resp(this), c = a[0];
    if (_.isPlainObject(c)) { let d; try { d = o.json(); } catch { /* compared as undefined */ } this.assert(_.isEqual(d, c), 'expected response body json to equal #{exp} but got #{act}', 'expected response body json to not equal #{exp}', c, d); return; }
    const t = o.text();
    if (!a.length) return hasBody.call(this);
    if (c instanceof RegExp) this.assert(c.test(t), `expected response body text to match ${c} but got #{act}`, `expected response body text #{act} to not match ${c}`, String(c), t);
    else this.assert(_.isEqual(t, c), 'expected response body to equal #{exp} but got #{act}', 'expected response body to not equal #{exp}', c, t);
  });
  A.addMethod('jsonBody', function (this: any, ...a: any[]) {
    const o = resp(this); let body: any, err = '';
    try { body = o.json(); } catch (e: any) { err = `${e.name}: ${e.message}`; }
    if (!a.length) { this.assert(!err, `expected response body to be a valid json but got error ${err}`, 'expected response body not to be a valid json'); return; }
    const path = a[0];
    if (!_.isString(path)) return;
    this.assert(_.has(body, path), 'expected #{act} in response to contain property #{exp}', 'expected #{act} in response to not contain property #{exp}', path, body);
    if (a.length > 1) { const v = _.get(body, path); this.assert(_.isEqual(v, a[1]), `expected response body json at "${path}" to contain #{exp} but got #{act}`, `expected response body json at "${path}" to not contain #{exp} but got #{act}`, a[1], v); }
  });
  const chainNum = (name: string, pick: (o: Resp) => number) => A.addChainableMethod(name, function (this: any, ...a: any[]) {
    const n = utils.flag(this, 'number');
    this.assert(_.isNumber(n), `expected response to have a valid ${name} but got #{act}`, `expected response to not have a valid ${name} but got #{act}`, null, n);
    if (a.length) this.assert(n === a[0], `expected response ${name} to equal #{exp} but got #{act}`, `expected response ${name} to not equal #{act}`, a[0], n);
  }, function (this: any) { const n = pick(resp(this)); utils.flag(this, 'number', n); utils.flag(this, 'object', n); });
  chainNum('responseTime', (o) => o.responseTime);
  chainNum('responseSize', (o) => o.size().total);
  A.addMethod('jsonSchema', function (this: any, schema: any, options?: any) {
    new A(schema).to.be.an('object');
    const data = this._obj instanceof Resp ? this._obj.json() : this._obj;
    // Postman validates draft-04 by default; ajv 8 only knows draft-07 without ajv-draft-04.
    const draft4 = typeof schema.$schema === 'string' && schema.$schema.includes('draft-04');
    const ajv = new (draft4 ? Ajv04 : Ajv)({ allErrors: true, strict: false, logger: false, ...options });
    const ok = ajv.validate(schema, data);
    this.assert(ok, `expected data to satisfy schema but found following errors: \n${ajv.errorsText()}`, 'expected data to not satisfy schema', true, ok);
  });
});

export function buildRequest(r: any) {
  const raw = typeof r.body === 'string' ? r.body : undefined;
  const req = new Req({
    id: r.id, name: r.name, method: r.method, url: r.url, headers: Object.entries(r.headers || {}).map(([key, value]) => ({ key, value: String(value) })),
    body: { ...(r.bodyDef || {}), ...(raw !== undefined ? { raw } : {}) }, auth: r.auth,
  });
  Object.defineProperty(req, 'to', { get: () => expect(req).to, enumerable: false });
  return req;
}

export function buildResponse(r: any, req?: Req) {
  const res = new Resp(r, req);
  Object.defineProperty(res, 'to', { get: () => expect(res).to, enumerable: false });
  return res;
}

/** Final request state as plain data for the host (applied to the real request in pre-request only). */
export function requestMods(req: Req) {
  const headers: Record<string, string> = {};
  for (const h of req.headers.all() as Header[]) {
    if (h.disabled) continue;
    const k = Object.keys(headers).find((x) => x.toLowerCase() === String(h.key).toLowerCase());
    if (k) headers[k] += `, ${h.value}`; else headers[String(h.key)] = String(h.value);
  }
  return { url: req.url.toString(), method: req.method, headers, body: req.body.raw };
}
export type { Req };
