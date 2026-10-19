const DEFAULT_ALLOWLIST = ['http://localhost:5173', 'http://localhost:3005', 'http://127.0.0.1:5173', 'http://127.0.0.1:3005'];

// The content script runs on every page, but must stay silent (no PONG, no
// bridge) unless the page's origin is in the user's allowlist — otherwise any
// site could fingerprint the extension or drive it.
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

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'reqspace-client') return;
  if (!(await isAllowed())) return;

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

// Announce presence (allowlisted origins only)
isAllowed().then((ok) => { if (ok) pong(); });
