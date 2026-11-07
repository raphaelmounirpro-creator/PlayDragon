/** Bridge exposed by electron/preload.cjs; absent in the browser and in development. */
interface UpdateBridge {
  onReady(callback: (version: string) => void): void;
  install(): void;
}

declare global {
  interface Window {
    playDragonUpdates?: UpdateBridge;
  }
}

/**
 * Shows a small notice when a new version has been downloaded in the background.
 * The update installs itself when the game is closed; the button applies it immediately.
 */
export function setupUpdateNotice(): void {
  const bridge = window.playDragonUpdates;
  const notice = document.getElementById('update-notice');
  const version = document.getElementById('update-version');
  const button = document.getElementById('update-install');
  if (!bridge || !notice || !version || !button) return;

  bridge.onReady((newVersion) => {
    version.textContent = newVersion;
    notice.classList.remove('hidden');
  });
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => bridge.install());
}
