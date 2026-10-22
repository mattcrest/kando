import { app, BrowserWindow, Menu, dialog } from 'electron';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { waitForServer, describeStartFailure } from './server-health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;
let serverProcess;

const PORT = 3001;
const MAX_RETRIES = 30;
const RETRY_INTERVAL = 100;

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

    let ready = false;
    serverProcess.on('exit', (code) => {
      console.log(`Server exited with code ${code}`);
      if (!ready) describeStartFailure(code, { port: PORT }).then((msg) => reject(new Error(msg)));
    });

    // Wait for server to be ready
    waitForServer(serverProcess.pid, { port: PORT, retries: MAX_RETRIES, intervalMs: RETRY_INTERVAL })
      .then(() => { ready = true; resolve(); })
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
    dialog.showErrorBox("Kando can't start", err.message);
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
