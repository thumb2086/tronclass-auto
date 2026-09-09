#!/usr/bin/env node

const { program } = require('commander');
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
  .command('menu')
  .description('互動式選單')
  .action(async () => {
    const { mainMenu } = require('../src/tui');
    await mainMenu();
  });

program
  .command('status')
  .description('查看各課程進度統計（含報表）')
  .action(async () => {
    const { showStatus } = require('../src/index');
    await showStatus();
  });

program
  .command('course')
  .description('管理課程列表')
  .option('-a, --add <url>', '新增課程 ID 或 URL')
  .option('-r, --remove <index>', '移除課程（輸入編號）')
  .option('-l, --list', '列出所有課程')
  .option('--clear', '清空所有課程')
  .action((opts) => {
    const { manageCourses } = require('../src/config');
    manageCourses(opts);
  });

program
  .command('update')
  .description('更新到最新版本')
  .action(async () => {
    const { execSync } = require('child_process');
    console.log(`目前版本: v${pkg.version}`);
    console.log('檢查最新版本...');
    try {
      const latest = execSync('npm view tronclass-auto version', { encoding: 'utf8' }).trim();
      console.log(`最新版本: v${latest}`);
      if (latest === pkg.version) {
        console.log('已經是最新版本！');
        return;
      }
      console.log('正在更新...');
      execSync('npm install -g tronclass-auto@latest', { stdio: 'inherit' });
      console.log('更新完成！');
    } catch (e) {
      console.error('更新失敗:', e.message);
      console.error('請手動執行: npm install -g tronclass-auto@latest');
    }
  });

program
  .command('config')
  .description('顯示目前設定')
  .action(() => {
    const { showConfig } = require('../src/config');
    showConfig();
  });

const args = process.argv.slice(2);
if (args.length === 0) {
  const { mainMenu } = require('../src/tui');
  mainMenu().catch(() => process.exit(0));
} else {
  program.parse();
}
