// Preload runs in an isolated context between the renderer and main process.
// Kept minimal: only expose a version string so the renderer can show "Desktop vX.Y" if useful.
// No Node APIs are leaked to the page — contextIsolation keeps the renderer sandboxed.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('hocgDesktop', {
  isElectron: true,
  version: process.versions.electron,
  platform: process.platform,
});
