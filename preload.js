const { contextBridge, ipcRenderer } = require('electron');

// The setup screen is the only renderer content that needs to talk to the main
// process. Exposing just this call lets the window run with contextIsolation
// on and nodeIntegration off, which matters because the app can be pointed at
// an arbitrary remote server URL.
contextBridge.exposeInMainWorld('reqspaceSetup', {
  choose: (choice) => ipcRenderer.send('setup-choice', choice),
});
