import { app, BrowserWindow, Menu } from 'electron';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;
let serverProcess;

const PORT = 3001;
const MAX_RETRIES = 30;
const RETRY_INTERVAL = 100;

// Check if server is ready by polling /api/health
function waitForServer(retries = 0) {
  return new Promise((resolve, reject) => {
    if (retries > MAX_RETRIES) {
      reject(new Error('Server failed to start'));
      return;
    }

    http.get(`http://localhost:${PORT}/api/health`, (res) => {
      if (res.statusCode === 200) {
        console.log('Server is ready');
        resolve();
      } else {
        setTimeout(() => waitForServer(retries + 1).then(resolve).catch(reject), RETRY_INTERVAL);
      }
    }).on('error', () => {
      setTimeout(() => waitForServer(retries + 1).then(resolve).catch(reject), RETRY_INTERVAL);
    });
  });
}

// Start the Node.js server
function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting server...');
    // Use relative path from main.js location (works in both dev and bundled scenarios)
    const serverPath = join(__dirname, 'server.js');
    const serverDir = join(__dirname, '..');
    serverProcess = spawn('node', [serverPath], {
      stdio: 'inherit',
      cwd: serverDir
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.log(`Server exited with code ${code}`);
    });

    // Wait for server to be ready
    waitForServer()
      .then(resolve)
      .catch(reject);
  });
}

// Create the window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(join(__dirname, 'app.html'));
  // Uncomment to debug in development: mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create app menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// App event handlers
app.on('ready', async () => {
  try {
    await startServer();
    createWindow();
    createMenu();
  } catch (err) {
    console.error('Failed to start app:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Gracefully stop server on app quit
app.on('before-quit', () => {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(1);
});
