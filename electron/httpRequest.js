// Pure Node HTTP(S) request helper for the Electron main process (client certs,
// proxy, verifySsl, timeout, abort). No Electron imports so it can be unit-tested
// and run with plain Node.
const http = require('http');
const https = require('https');
const tls = require('tls');

/** Does `pattern` match `hostname`? "*.example.com" matches subdomains only, never "example.com". */
function hostnameMatches(pattern, hostname) {
  const p = String(pattern || '').trim().toLowerCase();
  const h = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!p || !h) return false;
  if (p.startsWith('*.')) {
    if (/^[\d.]+$/.test(h) || h.includes(':')) return false; // wildcards never match IP literals
    const suffix = p.slice(1); // ".example.com"
    return h.length > suffix.length && h.endsWith(suffix);
  }
  return p === h;
}

/** Pick the client certificate for a hostname: exact match wins over wildcard. */
function findClientCertificate(certs, hostname) {
  if (!Array.isArray(certs)) return undefined;
  const exact = certs.find((c) => c && !String(c.hostname).trim().startsWith('*.') && hostnameMatches(c.hostname, hostname));
  return exact || certs.find((c) => c && hostnameMatches(c.hostname, hostname));
}

/** NO_PROXY style list: "localhost, .corp.com, *.x.com, host:port". */
function bypassProxy(noProxy, hostname) {
  const h = String(hostname).toLowerCase();
  return String(noProxy || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((e) => {
    if (e === '*') return true;
    const entry = e.replace(/:\d+$/, '');
    if (entry.startsWith('*.')) return h.endsWith(entry.slice(1));
    if (entry.startsWith('.')) return h.endsWith(entry) || h === entry.slice(1);
    return h === entry;
  });
}

function basicAuth(proxy) {
  return 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`).toString('base64');
}

function connectViaProxy(proxy, targetHost, targetPort, signal) {
  return new Promise((resolve, reject) => {
    const pHttps = proxy.protocol === 'https:';
    const headers = { Host: `${targetHost}:${targetPort}` };
    if (proxy.username) headers['Proxy-Authorization'] = basicAuth(proxy);
    const req = (pHttps ? https : http).request({
      host: proxy.hostname, port: proxy.port || (pHttps ? 443 : 80), method: 'CONNECT',
      path: `${targetHost}:${targetPort}`, headers, signal,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`)); }
      resolve(socket);
    });
    req.on('error', (e) => reject(e.name === 'AbortError' ? e : new Error(`Proxy error: ${e.message}`)));
    req.end();
  });
}

const canceled = () => Object.assign(new Error('Request was canceled by user.'), { name: 'AbortError', canceled: true });

/**
 * payload: { method, url, headers, body, timeout, verifySsl, followRedirects,
 *            clientCertificates: [{hostname,cert,key,passphrase}], cert?: {cert,key,passphrase},
 *            localProxy?: {url,noProxy,authEnabled,username,password} }
 * opts.signal: AbortSignal
 * Resolves { status, statusText, headers, body, isBase64, responseTime, size } or throws.
 */
async function sendRequest(payload, opts = {}, _redirects = 0) {
  const start = Date.now();
  const url = new URL(payload.url);
  const isHttps = url.protocol === 'https:';
  const method = (payload.method || 'GET').toUpperCase();
  const headers = { ...(payload.headers || {}) };
  const signal = opts.signal;
  if (signal && signal.aborted) throw canceled();

  const clientCert = (isHttps && (payload.cert || findClientCertificate(payload.clientCertificates, url.hostname))) || undefined;

  let proxy;
  const lp = payload.localProxy;
  if (lp && lp.url && !bypassProxy(lp.noProxy, url.hostname)) {
    proxy = new URL(lp.url);
    if (lp.authEnabled && lp.username) { proxy.username = lp.username; proxy.password = lp.password || ''; }
  }

  const reqOpts = {
    method, headers, signal,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    agent: false,
  };
  if (isHttps) {
    reqOpts.rejectUnauthorized = payload.verifySsl !== false;
    if (clientCert) {
      reqOpts.cert = clientCert.cert; reqOpts.key = clientCert.key;
      if (clientCert.passphrase) reqOpts.passphrase = clientCert.passphrase;
    }
    reqOpts.servername = /^[\d.]+$/.test(reqOpts.host) || reqOpts.host.includes(':') ? undefined : reqOpts.host;
  }

  let transport = isHttps ? https : http;
  try {
    if (proxy) {
      if (isHttps) {
        // Tunnel through CONNECT, then do TLS (with the client cert) over the tunnel.
        const socket = await connectViaProxy(proxy, reqOpts.host, reqOpts.port, signal);
        reqOpts.createConnection = () => tls.connect({
          socket, servername: reqOpts.servername, rejectUnauthorized: reqOpts.rejectUnauthorized,
          cert: reqOpts.cert, key: reqOpts.key, passphrase: reqOpts.passphrase,
        });
      } else {
        // Plain HTTP: absolute-URI forwarding to the proxy.
        reqOpts.host = proxy.hostname; reqOpts.port = proxy.port || (proxy.protocol === 'https:' ? 443 : 80);
        reqOpts.path = url.href;
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'host')) headers.Host = url.host;
        if (proxy.username) headers['Proxy-Authorization'] = basicAuth(proxy);
        transport = proxy.protocol === 'https:' ? https : http;
      }
    }
  } catch (e) {
    throw e.name === 'AbortError' ? canceled() : e;
  }

  let bodyBuf;
  const b = payload.body;
  if (b != null && method !== 'GET' && method !== 'HEAD') {
    bodyBuf = Buffer.isBuffer(b) ? b : typeof b === 'string' ? Buffer.from(b) : b && b.base64 ? Buffer.from(b.base64, 'base64') : Buffer.from(JSON.stringify(b));
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-length')) headers['Content-Length'] = bodyBuf.length;
  }

  const res = await new Promise((resolve, reject) => {
    const req = transport.request(reqOpts, resolve);
    if (payload.timeout > 0) {
      req.setTimeout(payload.timeout, () => req.destroy(Object.assign(new Error(`Request timed out after ${payload.timeout}ms`), { code: 'ETIMEDOUT' })));
    }
    req.on('error', (e) => reject(e.name === 'AbortError' || e.code === 'ABORT_ERR' ? canceled() : e));
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });

  const status = res.statusCode;
  if (payload.followRedirects !== false && [301, 302, 303, 307, 308].includes(status) && res.headers.location && _redirects < 10) {
    res.resume();
    const next = { ...payload, url: new URL(res.headers.location, url).href };
    if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) { next.method = 'GET'; next.body = undefined; }
    return sendRequest(next, opts, _redirects + 1);
  }

  const chunks = [];
  await new Promise((resolve, reject) => {
    res.on('data', (c) => chunks.push(c));
    res.on('end', resolve);
    res.on('error', (e) => reject(e.name === 'AbortError' || e.code === 'ABORT_ERR' ? canceled() : e));
    res.on('aborted', () => reject(signal && signal.aborted ? canceled() : new Error('Response aborted')));
  });
  const buf = Buffer.concat(chunks);
  const outHeaders = { ...res.headers }; // set-cookie stays an array
  const ct = String(res.headers['content-type'] || '').toLowerCase();
  const isText = !ct || /^text\/|json|xml|javascript|x-www-form-urlencoded|html/.test(ct);
  const isBase64 = buf.length > 0 && !isText;
  return {
    status, statusText: res.statusMessage || '', headers: outHeaders,
    body: isBase64 ? buf.toString('base64') : buf.toString('utf8'),
    isBase64, responseTime: Date.now() - start, size: buf.length,
  };
}

module.exports = { sendRequest, hostnameMatches, findClientCertificate, bypassProxy };
