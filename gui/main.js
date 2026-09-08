const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

const srcDir = path.join(__dirname, '..');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 500,
    title: 'TronClass Auto',
    backgroundColor: '#0f1117',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.whenReady().then(createWindow);

app.on('window-all-closed', () => { app.quit(); });

function loadConfig() {
  try { return require(path.join(srcDir, 'src', 'config')).loadConfig(); }
  catch { return { courses: [], playbackRate: 2, headless: false, slowMo: 50 }; }
}

function saveConfig(cfg) {
  try { require(path.join(srcDir, 'src', 'config')).saveConfig(cfg); }
  catch (e) { console.error(e); }
}

function loadCookies() {
  try { return require(path.join(srcDir, 'src', 'auth')).loadCookies(); }
  catch { return []; }
}

function saveCookies(cookies) {
  try { require(path.join(srcDir, 'src', 'auth')).saveCookies(cookies); }
  catch (e) { console.error(e); }
}

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', (e, cfg) => {
  saveConfig(cfg);
  return { ok: true };
});

ipcMain.handle('get-cookies', () => {
  const c = loadCookies();
  return { hasCookies: c.length > 0 };
});

ipcMain.handle('import-cookies', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '選擇 Cookie 檔',
    filters: [{ name: 'Cookie Files', extensions: ['json', 'txt', 'cookie'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  try {
    const fs = require('fs');
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    const cookies = JSON.parse(raw);
    if (!Array.isArray(cookies) || !cookies.length) return { ok: false, error: '格式不對' };
    saveCookies(cookies);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-status', async () => {
  const config = loadConfig();
  const cookies = loadCookies();
  if (!cookies.length) return { error: '沒有 Cookie' };

  const nodeVer = parseInt(process.version.replace('v', ''));
  if (nodeVer < 20) return { error: `需要 Node.js 20+，目前 ${process.version}` };

  const { chromium } = require(path.join(srcDir, 'node_modules', 'playwright'));
  const { ensureBrowser } = require(path.join(srcDir, 'src', 'browser'));
  const exePath = await ensureBrowser();
  const opts = {
    headless: config.headless !== false,
    args: ['--disable-gpu', '--no-sandbox', '--disable-cache', '--disable-dev-shm-usage']
  };
  if (exePath) opts.executablePath = exePath;

  const browser = await chromium.launch(opts);
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto('https://eclass.yuntech.edu.tw', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    if (page.url().includes('login')) {
      await browser.close();
      return { error: 'Cookie 過期，請重新登入' };
    }
  } catch (e) {
    await browser.close();
    return { error: '無法連線: ' + e.message };
  }

  const { getAllVideos } = require(path.join(srcDir, 'src', 'index'));
  const BASE_URL = 'https://eclass.yuntech.edu.tw';
  const results = [];
  const courses = config.courses || [];

  for (const courseUrl of courses) {
    const match = courseUrl.match(/\/course\/(\d+)\//);
    const courseId = match ? match[1] : '?';
    let courseName = '';
    try {
      await page.goto(`${BASE_URL}/course/${courseId}/content#/`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2000);
      courseName = await page.evaluate(() => {
        const el = document.querySelector('.learning-activities');
        if (!el) return '';
        try { const s = angular.element(el).scope(); return (s && s.course) ? (s.course.name || '') : ''; } catch { return ''; }
      });
    } catch (e) {}
    try {
      const allVideos = await getAllVideos(page, courseId);
      const videos = allVideos.filter(u => u.type === 'online_video');
      const completed = videos.filter(v => v.completeness === 'full').length;
      const future = videos.filter(v => v.isFuture && v.completeness !== 'full').length;
      const remaining = videos.filter(v => v.completeness !== 'full' && !v.isFuture).length;
      const exams = allVideos.filter(u => u.type === 'exam').length;
      const pct = videos.length > 0 ? Math.round((completed / videos.length) * 100) : 0;
      results.push({ courseId, courseName: courseName.substring(0, 30), total: videos.length, completed, remaining, future, exams, pct });
    } catch (e) {
      results.push({ courseId, courseName: courseName.substring(0, 30), total: 0, completed: 0, remaining: 0, future: 0, exams: 0, pct: 0 });
    }
  }

  await page.close();
  await browser.close();
  return { courses: results };
});

let runningProcess = null;

ipcMain.handle('run-watch', async (e, courseIds) => {
  if (runningProcess) return { ok: false, error: '已在執行中' };

  const { spawn } = require('child_process');
  const binPath = path.join(srcDir, 'bin', 'tronclass.js');
  const args = ['run', '--courses', courseIds.join(',')];

  runningProcess = spawn(process.execPath, [binPath, ...args], {
    cwd: srcDir,
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  runningProcess.stdout.on('data', (d) => {
    mainWindow?.webContents.send('watch-log', d.toString());
  });
  runningProcess.stderr.on('data', (d) => {
    mainWindow?.webContents.send('watch-log', d.toString());
  });
  runningProcess.on('close', (code) => {
    runningProcess = null;
    mainWindow?.webContents.send('watch-done', code);
  });

  return { ok: true };
});

ipcMain.handle('stop-watch', () => {
  if (runningProcess) {
    runningProcess.kill();
    runningProcess = null;
    return { ok: true };
  }
  return { ok: false };
});
