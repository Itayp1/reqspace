window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'reqspace-client') return;

  if (event.data.type === 'REQSPACE_PING') {
    window.postMessage({
      source: 'reqspace-extension',
      type: 'REQSPACE_PONG',
      version: chrome.runtime.getManifest().version
    }, '*');
    return;
  }

  if (event.data.type === 'REQSPACE_SEND') {
    chrome.runtime.sendMessage({
      type: 'SEND_REQUEST',
      payload: event.data.payload
    }, (response) => {
      window.postMessage({
        source: 'reqspace-extension',
        type: 'REQSPACE_RESPONSE',
        id: event.data.id,
        response: response
      }, '*');
    });
  }
});

// Announce presence immediately
window.postMessage({
  source: 'reqspace-extension',
  type: 'REQSPACE_PONG',
  version: chrome.runtime.getManifest().version
}, '*');
