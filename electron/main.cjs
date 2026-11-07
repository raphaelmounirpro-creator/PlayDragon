const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const { setupAutoUpdate } = require('./updater.cjs');

function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#120806',
    title: 'PlayDragon',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  Menu.setApplicationMenu(null);
  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      window.setFullScreen(!window.isFullScreen());
      event.preventDefault();
    }
  });
  return window;
}

app.whenReady().then(() => {
  const window = createWindow();
  window.webContents.once('did-finish-load', () => setupAutoUpdate(window));
});
app.on('window-all-closed', () => app.quit());
