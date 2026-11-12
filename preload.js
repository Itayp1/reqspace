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
  });
}
