// Automatic updates for the installed game: checks the latest GitHub Release at startup,
// downloads it in the background, then installs it on quit (or right away if the player asks).
// The game is never uninstalled: the new installer replaces the files in place.
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');

function createFileLogger() {
  const file = path.join(app.getPath('userData'), 'update.log');
  const write = (level) => (...parts) => {
    try {
      fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${parts.join(' ')}\n`);
    } catch {
      // Logging must never break the game.
    }
  };
  return { info: write('info'), warn: write('warn'), error: write('error'), debug: () => {} };
}

/** Only the installed game can update itself: not the portable exe, not development runs. */
function canUpdate() {
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
}

function setupAutoUpdate(window) {
  if (!canUpdate()) return;
  const logger = createFileLogger();
  autoUpdater.logger = logger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => logger.warn('update failed:', error?.message ?? error));
  autoUpdater.on('update-downloaded', (info) => {
    if (!window.isDestroyed()) window.webContents.send('update-ready', info.version);
  });
  ipcMain.on('install-update', () => autoUpdater.quitAndInstall(true, true));

  autoUpdater.checkForUpdates().catch((error) => logger.warn('update check failed:', error?.message ?? error));
}

module.exports = { setupAutoUpdate };
