// Exposes only what the game needs from the update system, nothing else from Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('playDragonUpdates', {
  onReady: (callback) => ipcRenderer.on('update-ready', (_event, version) => callback(version)),
  install: () => ipcRenderer.send('install-update'),
});
