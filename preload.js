const { contextBridge, ipcRenderer } = require('electron');

// The setup screen is the only renderer content that needs to talk to the main
// process. Exposing just this call lets the window run with contextIsolation
// on and nodeIntegration off, which matters because the app can be pointed at
// an arbitrary remote server URL.
contextBridge.exposeInMainWorld('reqspaceSetup', {
  choose: (choice) => ipcRenderer.send('setup-choice', choice),
});

// The client transport abstraction (TODO.md SEC-0.2) — the only way the
// renderer can reach the network in the desktop build. `req` must be JSON
// structured-cloneable; the AbortSignal on OutboundRequest never survives the
// IPC boundary, so the caller (client/src/transport/electron.ts) strips it
// before invoking this and handles cancellation on its own side.
contextBridge.exposeInMainWorld('reqspace', {
  send: (req) => ipcRenderer.invoke('reqspace:send', req),
});
