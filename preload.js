const { contextBridge, ipcRenderer } = require('electron');

// The setup screen is the only renderer content that needs to talk to the main
// process. Exposing just this call lets the window run with contextIsolation
// on and nodeIntegration off, which matters because the app can be pointed at
// an arbitrary remote server URL.
contextBridge.exposeInMainWorld('reqspaceSetup', {
  choose: (choice) => ipcRenderer.send('setup-choice', choice),
  pickDbFolder: () => ipcRenderer.invoke('reqspace:pick-db-folder'),
  defaultDbDir: () => ipcRenderer.invoke('reqspace:default-db-dir'),
});

// Desktop HTTP transport (see electron/httpRequest.js). The renderer only gets
// these two calls; the actual request runs in the main process.
// Skipped only when the app is launched with --e2e-web-transport (automated UI tests, see main.js).
if (!process.argv.includes('--e2e-web-transport')) {
  contextBridge.exposeInMainWorld('electron', {
    sendRequest: (payload, requestId) => ipcRenderer.invoke('reqspace:send-request', payload, requestId),
    abortRequest: (requestId) => ipcRenderer.send('reqspace:abort-request', requestId),
    // Login screen escape hatch: restart in single-user offline mode.
    workOffline: () => ipcRenderer.send('reqspace:work-offline'),
    // Live connections (Kafka, authenticated WebSocket); results are { ok, data | error }.
    connOpen: (id, kind, cfg) => ipcRenderer.invoke('reqspace:conn-open', id, kind, cfg),
    connClose: (id) => ipcRenderer.invoke('reqspace:conn-close', id),
    connSend: (id, payload) => ipcRenderer.invoke('reqspace:conn-send', id, payload),
    connCommit: (id, m) => ipcRenderer.invoke('reqspace:conn-commit', id, m),
    kafkaList: (cfg) => ipcRenderer.invoke('reqspace:kafka-list', cfg),
    onConnEvent: (cb) => {
      const h = (_e, id, ev) => cb(id, ev);
      ipcRenderer.on('reqspace:conn-event', h);
      return () => ipcRenderer.removeListener('reqspace:conn-event', h);
    },
  });
}
