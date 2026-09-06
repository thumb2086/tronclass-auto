#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');

const pkg = require('../package.json');

program
  .name('tronclass')
  .description('自動觀看 eclass/TronClass 影片、填寫表單')
  .version(pkg.version);

program
  .command('login')
  .description('自動開啟瀏覽器登入，完成後自動取得 Cookie')
  .option('--url <url>', '登入頁面網址', 'https://eclass.yuntech.edu.tw')
  .action(async (opts) => {
    const { autoLogin } = require('../src/auth');
    await autoLogin(opts.url);
  });

program
  .command('import-cookies <cookieString>')
  .alias('ic')
  .description('手動匯入 Cookie 字串')
  .action(async (cookieString) => {
    const { importCookies } = require('../src/auth');
    importCookies(cookieString);
  });

program
  .command('run')
  .description('開始自動觀看影片')
  .option('--headless', '無頭模式執行', false)
  .option('--course <ids>', '指定課程 ID（逗號分隔）', '')
  .action(async (opts) => {
    const { run } = require('../src/index');
    await run(opts);
  });

program
  .command('status')
  .description('查看各課程進度統計')
  .action(async () => {
    const { showStatus } = require('../src/index');
    await showStatus();
  });

program
  .command('config')
  .description('顯示目前設定')
  .action(() => {
    const { showConfig } = require('../src/config');
    showConfig();
  });

program.parse();
