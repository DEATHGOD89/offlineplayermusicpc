const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Spoty',
    icon: path.join(__dirname, 'public/logo512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
  });

  // Load the built dist/index.html
  win.loadFile(path.join(__dirname, 'dist/index.html'));

  // Remove default menu bar for a clean, premium desktop app appearance
  win.setMenuBarVisibility(false);

  // Security: Prevent un-sandboxed window navigation away from local app
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // Security: Intercept window.open calls and route external links to OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// Handle IPC messages for compact Mini-Player window resizing & positioning
ipcMain.on('toggle-mini-player', (event, isMini) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (isMini) {
    win.setSize(340, 390); // Perfect size to fit the vertical mini-card and window decorations
    win.setAlwaysOnTop(true);
    win.setResizable(false);
    win.setMaximizable(false);
  } else {
    win.setAlwaysOnTop(false);
    win.setResizable(true);
    win.setMaximizable(true);
    win.setSize(1280, 720);
    win.center();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
