// Electron main process — wraps the existing vanilla JS web app into a desktop window.
// This is a fan-made, non-commercial build for personal practice — not for distribution.

import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths differ between `electron .` (dev) and a packaged .app bundle.
// In packaged mode, extraResources land in `process.resourcesPath`; in dev we point to repo root.
const repoRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', 'web');

// Launch straight into the battle simulator (game/index.html) — this app is
// specifically for practicing battles; the full meta/deck/news site stays web-only.
const indexPath = path.join(repoRoot, 'game', 'index.html');

let mainWindow = null;
let wsServerProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'hololive Card Practice (Fan-made)',
    backgroundColor: '#f7f5ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow file:// fetch for local assets (cards.json, images, etc.)
      webSecurity: true,
    },
  });

  mainWindow.loadFile(indexPath);

  // Open external links in the system browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Game',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About this fan-made project',
          click: () => shell.openExternal('https://github.com/H2KFORGIVEN/hololive-cardgame-fanmade'),
        },
        {
          label: 'Official hololive Card Game',
          click: () => shell.openExternal('https://hololive-official-cardgame.com/'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Local-WebSocket-server startup for the "Online" mode: lets two players on the
// same machine (or LAN) run the bundled ws-server against localhost.
// The `ws` npm package is bundled at ${resourcesPath}/node_modules/ws so Node's
// default "walk up from script" resolver finds it when walking from
// Resources/web/game/server/ws-server.js → Resources/node_modules/ws.
function startLocalWsServer() {
  if (wsServerProcess) return;
  const serverScript = path.join(repoRoot, 'game', 'server', 'ws-server.js');
  try {
    wsServerProcess = spawn(process.execPath, [serverScript], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    wsServerProcess.stdout?.on('data', (d) => console.log('[ws]', d.toString().trim()));
    wsServerProcess.stderr?.on('data', (d) => console.error('[ws err]', d.toString().trim()));
    wsServerProcess.on('exit', (code) => {
      console.log('[ws] exited code=', code);
      wsServerProcess = null;
    });
  } catch (e) {
    console.warn('Failed to start ws-server:', e);
  }
}

app.whenReady().then(() => {
  buildMenu();
  startLocalWsServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (wsServerProcess) { try { wsServerProcess.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (wsServerProcess) { try { wsServerProcess.kill(); } catch {} }
});
