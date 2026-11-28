const DEFAULT_ALLOWLIST = ['http://localhost:5173', 'http://localhost:3005', 'http://127.0.0.1:5173', 'http://127.0.0.1:3005'];

async function getAllowlist() {
  const result = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
  return result.originAllowlist;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_REQUEST') {
    handleRequest(message.payload, sender.origin, message.id).then(sendResponse);
    return true; // async
  }
  if (message.type === 'CANCEL_REQUEST') {
    // Only abort requests started by the same origin that is cancelling them.
    const entry = inflight.get(message.id);
    if (entry && entry.origin === sender.origin) entry.controller.abort();
  }
});

// The page asks over a port so the body can be streamed in chunks: one huge message
// (or one huge string) would crash the tab. The page acks every chunk it takes; the
// service worker stops reading the response while STREAM_WINDOW chunks are unacked.
const STREAM_WINDOW = 32;
const STREAM_CHUNK_BYTES = 256 * 1024;
chrome.runtime.onConnect?.addListener((port) => {
  if (port.name !== 'reqspace-send') return;
  port.onMessage.addListener(function onFirst(message) {
    if (message.type !== 'SEND') return;
    port.onMessage.removeListener(onFirst);
    handleRequest(message.payload, port.sender.origin, message.id, port)
      .then((result) => { if (result) port.postMessage({ type: 'RESULT', response: result }); })
      .catch((e) => port.postMessage({ type: 'RESULT', response: { error: e.message } }))
      .finally(() => { try { port.disconnect(); } catch (e) { /* page already left */ } });
  });
});

/** Reads the response body and forwards it as base64 chunks, pausing while the page has not acked. */
async function streamBody(res, port, controller) {
  let credits = STREAM_WINDOW;
  let wake = null;
  port.onMessage.addListener((m) => { if (m.type === 'ACK') { credits++; wake?.(); } });
  port.onDisconnect.addListener(() => { controller.abort(); wake?.(); });
  if (!res.body) { port.postMessage({ type: 'END' }); return; }
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i += STREAM_CHUNK_BYTES) {
      while (credits <= 0 && !controller.signal.aborted) await new Promise((r) => { wake = r; });
      if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
      credits--;
      port.postMessage({ type: 'CHUNK', data: toBase64(value.subarray(i, i + STREAM_CHUNK_BYTES)) });
    }
  }
  port.postMessage({ type: 'END' });
}

let nextRuleId = 1;
const inflight = new Map(); // request id -> { controller, origin }

// Rules from a previous service-worker life must not accumulate (ids restart at 1).
chrome.declarativeNetRequest.getSessionRules()
  .then((rules) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map((r) => r.id) }))
  .catch(() => {});

// fetch() hides Set-Cookie (forbidden response header). Capture it with webRequest
// (extraHeaders) for requests the extension itself issues, keyed by request URL.
const cookieCollectors = new Map(); // url -> string[]
try {
  chrome.webRequest.onHeadersReceived.addListener((details) => {
    if (details.tabId !== -1) return;
    const list = cookieCollectors.get(details.url);
    if (!list) return;
    for (const h of details.responseHeaders || []) {
      if (h.name.toLowerCase() === 'set-cookie' && h.value) list.push(h.value);
    }
  }, { urls: ['<all_urls>'] }, ['responseHeaders', 'extraHeaders']);
} catch (e) { /* webRequest unavailable */ }

// ---- Client-side proxy (per-request, via chrome.proxy) ----------------------------
// chrome.proxy is browser-wide, so the proxy is only set while at least one request
// that wants it is in flight, and the user's previous setting is restored afterwards.
// Note: while it is active, other browsing in this profile also goes through it.
let proxyUsers = 0;
let proxySaved = null; // setting captured before we overrode it
let proxyChain = Promise.resolve();

function buildProxyConfig(lp) {
  let u;
  try { u = new URL(String(lp.url).trim()); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const bypass = ['<-loopback>'];
  String(lp.noProxy || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((h) => bypass.push(h));
  // Chrome bypasses loopback hosts by default; <-loopback> turns that off so 127.0.0.1 targets are proxied too.
  return {
    mode: 'fixed_servers',
    rules: {
      singleProxy: { scheme: u.protocol === 'https:' ? 'https' : 'http', host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80) },
      bypassList: bypass
    }
  };
}

function acquireProxy(lp) {
  const cfg = lp && lp.url ? buildProxyConfig(lp) : null;
  if (!cfg || !chrome.proxy) return Promise.resolve(false);
  proxyChain = proxyChain.then(async () => {
    if (proxyUsers === 0) proxySaved = await chrome.proxy.settings.get({ incognito: false });
    proxyUsers++;
    await chrome.proxy.settings.set({ value: cfg, scope: 'regular' });
  }).catch(() => {});
  return proxyChain.then(() => true);
}

function releaseProxy() {
  proxyChain = proxyChain.then(async () => {
    proxyUsers = Math.max(0, proxyUsers - 1);
    if (proxyUsers > 0) return;
    const saved = proxySaved;
    proxySaved = null;
    if (saved && saved.levelOfControl === 'controlled_by_this_extension') await chrome.proxy.settings.set({ value: saved.value, scope: 'regular' });
    else await chrome.proxy.settings.clear({ scope: 'regular' });
  }).catch(() => {});
  return proxyChain;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isBinaryType(ct) {
  ct = (ct || '').toLowerCase();
  if (!ct) return false;
  if (/^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|graphql))/.test(ct)) return false;
  if (/(\+json|\+xml|charset=)/.test(ct)) return false;
  return /^(image|audio|video|font)\//.test(ct) || /^application\/(pdf|zip|octet-stream|gzip|x-|vnd\.)/.test(ct);
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** With `port` the body is streamed to it and nothing is returned on success; without, the whole body is returned. */
async function handleRequest(payload, origin, requestId, port) {
  const allowlist = await getAllowlist();
  if (!allowlist.includes(origin)) {
    return { error: `Origin ${origin} is not in the extension allowlist. Please add it in the extension options.` };
  }

  const { method, url, headers, body, localProxy } = payload;
  
  const forbiddenKeys = ['origin', 'referer', 'cookie', 'host', 'user-agent'];
  const requestHeaders = [];
  const fetchHeaders = new Headers();
  
  for (const [key, value] of Object.entries(headers || {})) {
    if (forbiddenKeys.includes(key.toLowerCase())) {
      requestHeaders.push({ header: key, operation: 'set', value: value });
    } else {
      fetchHeaders.append(key, value);
    }
  }

  let normalizedUrl = url;
  try {
    const u = new URL(url);
    u.hash = ''; // fetch() never sends the fragment
    normalizedUrl = u.href;
  } catch (e) {
    return { error: `Invalid URL: ${url}` };
  }

  const controller = new AbortController();
  if (requestId) inflight.set(requestId, { controller, origin });
  const cookies = [];
  cookieCollectors.set(normalizedUrl, cookies);

  let proxyAcquired = false;
  let ruleId = null;
  if (requestHeaders.length > 0) {
    ruleId = nextRuleId++;
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: requestHeaders
        },
        condition: {
          // urlFilter treats * | ^ as wildcards; match the exact URL via an escaped regex instead.
          regexFilter: '^' + escapeRegex(normalizedUrl) + '$',
          tabIds: [-1] // Target background script requests
        }
      }]
    });
  }

  try {
    // Increment session request counter (shown in popup)
    chrome.storage.session.get({ reqCount: 0 }).then(({ reqCount }) => {
      chrome.storage.session.set({ reqCount: (reqCount || 0) + 1 });
    }).catch(() => {});

    const init = {
      method: method || 'GET',
      headers: fetchHeaders,
      credentials: 'omit', // 0.7.4
      signal: controller.signal
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      init.body = body;
    }
    
    proxyAcquired = await acquireProxy(localProxy);
    const startTime = Date.now();
    const res = await fetch(url, init);
    const time = Date.now() - startTime;
    
    const responseHeaders = {};
    for (const [key, value] of res.headers.entries()) {
      responseHeaders[key] = value;
    }
    
    const isBase64 = isBinaryType(res.headers.get('content-type'));
    if (port) {
      if (cookies.length) responseHeaders['set-cookie'] = cookies;
      port.postMessage({
        type: 'HEAD',
        response: {
          status: res.status, statusText: res.statusText, headers: responseHeaders, isBase64, time, stream: true,
          size: Number(res.headers.get('content-length')) || 0,
        },
      });
      await streamBody(res, port, controller);
      return null;
    }

    const buf = await res.arrayBuffer();
    const responseBody = isBase64 ? toBase64(buf) : new TextDecoder('utf-8').decode(buf);
    if (cookies.length) responseHeaders['set-cookie'] = cookies;
    return {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      body: responseBody,
      isBase64,
      size: buf.byteLength,
      time
    };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Request was canceled by user.' : e.message, canceled: e.name === 'AbortError' };
  } finally {
    if (requestId) inflight.delete(requestId);
    cookieCollectors.delete(normalizedUrl);
    if (proxyAcquired) await releaseProxy();
    if (ruleId !== null) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId]
      });
    }
  }
}
