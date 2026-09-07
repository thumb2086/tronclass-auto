const fs = require('fs');
const crypto = require('crypto');
const chalk = require('chalk');
const { COOKIE_FILE, SALT_FILE, ensureDir, BASE_URL } = require('./config');

function getKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 480000, 32, 'sha256');
}

function saveCookies(cookies, password = 'eclass-local-key') {
  ensureDir();
  let salt;
  if (fs.existsSync(SALT_FILE)) {
    salt = fs.readFileSync(SALT_FILE);
  } else {
    salt = crypto.randomBytes(16);
    fs.writeFileSync(SALT_FILE, salt);
  }
  const key = getKey(password, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const data = JSON.stringify(cookies);
  let encrypted = cipher.update(data, 'utf-8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  fs.writeFileSync(COOKIE_FILE, Buffer.concat([iv, encrypted]));
  console.log(chalk.green(`[AUTH] Cookie 已加密儲存 (${cookies.length} 個)`));
}

function loadCookies(password = 'eclass-local-key') {
  if (!fs.existsSync(COOKIE_FILE) || !fs.existsSync(SALT_FILE)) {
    return [];
  }
  try {
    const salt = fs.readFileSync(SALT_FILE);
    const key = getKey(password, salt);
    const raw = fs.readFileSync(COOKIE_FILE);
    const iv = raw.subarray(0, 16);
    const encrypted = raw.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const cookies = JSON.parse(decrypted.toString('utf-8'));
    return cookies;
  } catch (e) {
    console.log(chalk.red(`[AUTH] Cookie 解密失敗: ${e.message}`));
    return [];
  }
}

function parseCookieString(cookieStr) {
  const cookies = [];
  for (const part of cookieStr.split(';')) {
    const trimmed = part.trim();
    if (trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const name = trimmed.substring(0, idx).trim();
      const value = trimmed.substring(idx + 1).trim();
      cookies.push({
        name,
        value,
        domain: '.yuntech.edu.tw',
        path: '/'
      });
    }
  }
  return cookies;
}

function importCookies(cookieStr) {
  const cookies = parseCookieString(cookieStr);
  if (cookies.length === 0) {
    console.log(chalk.red('[AUTH] 找不到有效的 Cookie'));
    return;
  }
  saveCookies(cookies);
  console.log(chalk.green(`[AUTH] 匯入 ${cookies.length} 個 Cookie`));
}

async function autoLogin(baseUrl) {
  console.log(chalk.cyan('\n=== 自動登入 ==='));
  console.log(chalk.yellow('將開啟瀏覽器，請手動登入'));
  console.log(chalk.yellow('登入成功後，Cookie 會自動儲存\n'));

  const { ensureBrowser } = require('./browser');
  const exePath = await ensureBrowser();

  const { chromium } = require('playwright');
  const launchOpts = { headless: false, slowMo: 50, args: ['--disable-background-timer-throttling'] };
  if (exePath) launchOpts.executablePath = exePath;

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log(chalk.cyan('等待您完成登入...'));
  console.log(chalk.cyan('（登入後頁面會自動跳轉，Cookie 會自動儲存）'));

  let sawLogin = false;
  let saved = false;
  let checkCount = 0;

  const checkInterval = setInterval(async () => {
    checkCount++;
    const url = page.url();
    const isLoginPage = url.includes('login') || url.includes('auth') || url.includes('cas') || url.includes('signin');

    if (isLoginPage) {
      sawLogin = true;
    }

    if (sawLogin && !isLoginPage && !saved) {
      saved = true;
      console.log(chalk.cyan('偵測到頁面跳轉，驗證登入狀態...'));
      await page.waitForTimeout(3000);

      const isLoggedIn = await page.evaluate(() => {
        return document.querySelector('[class*="profile"]') !== null ||
               document.querySelector('[class*="avatar"]') !== null ||
               document.querySelector('[class*="user-name"]') !== null ||
               document.querySelector('[ng-click*="showUserOperationList"]') !== null ||
               document.querySelector('a[href*="logout"]') !== null ||
               document.querySelector('a[href*="settings"]') !== null;
      });

      if (!isLoggedIn) {
        console.log(chalk.yellow('  頁面已跳轉但未偵測到登入狀態，可能未完成登入'));
        saved = false;
        return;
      }

      const cookies = await context.cookies();
      const eclassCookies = cookies.filter(c =>
        c.domain.includes('yuntech.edu.tw') || c.domain.includes('eclass')
      );

      if (eclassCookies.length > 0) {
        saveCookies(eclassCookies);
        console.log(chalk.green(`\n[AUTH] 登入成功！自動取得 ${eclassCookies.length} 個 Cookie`));
        console.log(chalk.green('[AUTH] 現在可以執行 tronclass run 開始自動化\n'));
      } else {
        console.log(chalk.yellow('\n[AUTH] 找不到 eclass Cookie，請確認已成功登入'));
      }

      clearInterval(checkInterval);
      await browser.close();
    }

    if (checkCount > 300) {
      console.log(chalk.red('\n[AUTH] 等待超時（5分鐘），請重新執行'));
      clearInterval(checkInterval);
      await browser.close();
    }
  }, 1000);
}

module.exports = {
  saveCookies, loadCookies, parseCookieString, importCookies, autoLogin
};
