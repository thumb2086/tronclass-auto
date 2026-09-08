const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let tuiProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'TronClass Auto',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (tuiProcess) tuiProcess.kill();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (tuiProcess) tuiProcess.kill();
  app.quit();
});

ipcMain.handle('run-command', async (event, args) => {
  return new Promise((resolve) => {
    const binPath = path.join(__dirname, '..', 'bin', 'tronclass.js');
    const proc = spawn(process.execPath, [binPath, ...args], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
});
