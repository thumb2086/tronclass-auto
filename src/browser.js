const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function getChromiumPath() {
  const playwrightPath = path.join(
    require('os').homedir(),
    'AppData', 'Local', 'ms-playwright'
  );
  if (!fs.existsSync(playwrightPath)) return null;

  const dirs = fs.readdirSync(playwrightPath).filter(d => d.startsWith('chromium-'));
  if (dirs.length === 0) return null;

  const chromiumDir = dirs.sort().reverse()[0];
  const exePath = path.join(playwrightPath, chromiumDir, 'chrome-win64', 'chrome.exe');
  return fs.existsSync(exePath) ? exePath : null;
}

async function ensureBrowser() {
  const exe = getChromiumPath();
  if (exe) return exe;

  console.log(chalk.yellow('[SETUP] Chromium 未安裝，正在下載...'));
  console.log(chalk.gray('  首次安裝需要一些時間，之後不需要再裝\n'));

  try {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log(chalk.green('\n[SETUP] Chromium 安裝完成\n'));
    return getChromiumPath();
  } catch (e) {
    console.log(chalk.red('\n[ERROR] Chromium 安裝失敗'));
    console.log(chalk.yellow('  請手動執行: npx playwright install chromium'));
    return null;
  }
}

module.exports = { ensureBrowser, getChromiumPath };
