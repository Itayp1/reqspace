const DEFAULT_ALLOWLIST = ['http://localhost:5173', 'http://localhost:3005', 'http://127.0.0.1:5173', 'http://127.0.0.1:3005'];

// The content script runs on every page and never relays requests unless the
// page's origin is in the user's allowlist. A non-allowlisted page only learns
// "installed, not allowed" (so Reqspace can offer to add itself) and can add its
// origin only after the user confirms a dialog.
async function isAllowed() {
  try {
    const { originAllowlist } = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
    return originAllowlist.includes(window.location.origin);
  } catch (e) {
    return false;
  }
}

function pong() {
  window.postMessage({
    source: 'reqspace-extension',
    type: 'REQSPACE_PONG',
    version: chrome.runtime.getManifest().version
  }, '*');
}

function notAllowed() {
  window.postMessage({ source: 'reqspace-extension', type: 'REQSPACE_NOT_ALLOWED', origin: window.location.origin }, '*');
}

async function addOrigin() {
  const origin = window.location.origin;
  if (!confirm(`Reqspace Transport: allow ${origin} to send requests through this extension?`)) return;
  const { originAllowlist } = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
  await chrome.storage.local.set({ originAllowlist: [...new Set([...originAllowlist, origin])] });
  pong();
}

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'reqspace-client') return;
  if (!(await isAllowed())) {
    if (event.data.type === 'REQSPACE_PING') notAllowed();
    if (event.data.type === 'REQSPACE_ADD_ORIGIN') await addOrigin();
    return;
  }

  if (event.data.type === 'REQSPACE_PING') {
    pong();
    return;
  }

  if (event.data.type === 'REQSPACE_CANCEL') {
    chrome.runtime.sendMessage({ type: 'CANCEL_REQUEST', id: event.data.id });
    return;
  }

  if (event.data.type === 'REQSPACE_SEND') {
    chrome.runtime.sendMessage({
      type: 'SEND_REQUEST',
      id: event.data.id,
      payload: event.data.payload
    }, (response) => {
      window.postMessage({
        source: 'reqspace-extension',
        type: 'REQSPACE_RESPONSE',
        id: event.data.id,
        response: response || { error: chrome.runtime.lastError?.message || 'No response from extension' }
      }, '*');
    });
  }
});

// Announce presence: PONG if allowed, otherwise only "not allowed"
isAllowed().then((ok) => { if (ok) pong(); else notAllowed(); });
