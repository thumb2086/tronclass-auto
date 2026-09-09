const readline = require('readline');
const chalk = require('chalk');
const { loadConfig, saveConfig, BASE_URL } = require('./config');
const { loadCookies } = require('./auth');
const pkg = require('../package.json');

function clear() {
  process.stdout.write('\x1B[2J\x1B[H');
}

function header() {
  const config = loadConfig();
  const lines = [
    '',
    chalk.white('╔' + '═'.repeat(52) + '╗'),
    chalk.white('║ ') + chalk.bold.white(`tronclass-auto  v${pkg.version}`.padEnd(52)) + chalk.white('║'),
    chalk.white('║ ') + chalk.gray('自動觀看 eclass/TronClass 影片'.padEnd(52)) + chalk.white('║'),
    chalk.white('║ ') + `課程: ${chalk.cyan(config.courses.length)} 個  |  Cookie: ${chalk.green('✓')}  |  倍速: ${chalk.yellow(config.playbackRate || 2)}x`.padEnd(52) + chalk.white('║'),
    chalk.white('╚' + '═'.repeat(52) + '╝'),
  ];
  lines.forEach(l => process.stdout.write(l + '\n'));
}

function draw(extraLines) {
  clear();
  header();
  if (extraLines) extraLines.forEach(l => process.stdout.write(l + '\n'));
}

function menu(title, choices, extraLines) {
  return new Promise((resolve) => {
    let selected = 0;

    function render() {
      clear();
      header();
      if (extraLines) extraLines.forEach(l => process.stdout.write(l + '\n'));
      process.stdout.write('\n');
      choices.forEach((c, i) => {
        const prefix = i === selected ? chalk.green('>') : ' ';
        if (typeof c === 'string' && c === '__sep__') {
          process.stdout.write(chalk.gray('  ─────────────') + '\n');
        } else {
          process.stdout.write(`  ${prefix} ${c.name}\n`);
        }
      });
      process.stdout.write('\n' + chalk.gray('  ↑↓ 移動  Enter 確認  ESC 返回') + '\n');
    }

    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(data) {
      const key = data.toString();
      if (key === '\u001b[A') {
        selected = Math.max(0, selected - 1);
        while (selected >= 0 && typeof choices[selected] === 'string' && choices[selected] === '__sep__') selected--;
        if (selected < 0) selected = 0;
        render();
      } else if (key === '\u001b[B') {
        selected = Math.min(choices.length - 1, selected + 1);
        while (selected < choices.length && typeof choices[selected] === 'string' && choices[selected] === '__sep__') selected++;
        if (selected >= choices.length) selected = choices.length - 1;
        render();
      } else if (key === '\r' || key === '\n') {
        cleanup();
        resolve(choices[selected]);
      } else if (key === '\u001b') {
        cleanup();
        resolve(null);
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
  });
}

function confirm(message, defaultVal = true) {
  return new Promise((resolve) => {
    process.stdout.write(`  ${message} (${defaultVal ? 'Y/n' : 'y/N'}) `);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(data) {
      const key = data.toString();
      if (key === '\r' || key === '\n') { cleanup(); resolve(defaultVal); }
      else if (key === '\u001b') { cleanup(); resolve(null); }
      else if (key.toLowerCase() === 'y') { cleanup(); resolve(true); }
      else if (key.toLowerCase() === 'n') { cleanup(); resolve(false); }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
  });
}

function input(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${message}: `, (answer) => { rl.close(); resolve(answer); });
  });
}

function pressAnyKey() {
  return new Promise((resolve) => {
    process.stdout.write(chalk.gray('\n  按任意鍵返回...'));
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => { process.stdin.setRawMode(false); process.stdin.pause(); resolve(); });
  });
}

async function fetchCourseNames(config) {
  const courses = config.courses || [];
  if (!courses.length) return {};
  const cookies = loadCookies();
  if (!cookies.length) return {};
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, slowMo: 50, args: ['--disable-gpu', '--no-sandbox', '--disable-cache'] });
    const ctx = await browser.newContext();
    await ctx.addCookies(cookies);
    const pg = await ctx.newPage();
    const results = await Promise.all(courses.map(async (url) => {
      const match = url.match(/\/course\/(\d+)\//);
      if (!match) return { id: '?', name: '' };
      const p = await ctx.newPage();
      try {
        await p.goto(`${BASE_URL}/course/${match[1]}/content#/`, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await p.waitForTimeout(2000);
        const name = await p.evaluate(() => {
          const el = document.querySelector('.learning-activities');
          if (!el) return '';
          try { const s = angular.element(el).scope(); return (s && s.course) ? (s.course.name || '') : ''; } catch { return ''; }
        });
        return { id: match[1], name: name.substring(0, 25) };
      } catch (e) { return { id: match[1], name: '' }; }
      finally { await p.close(); }
    }));
    await pg.close();
    await browser.close();
    const names = {};
    results.forEach(r => { if (r.name) names[r.id] = r.name; });
    return names;
  } catch (e) { return {}; }
}

async function mainMenu() {
  const cookies = loadCookies();
  if (!cookies.length) {
    console.log(chalk.red('\n  沒有 Cookie，請先執行 tronclass login\n'));
    return;
  }

  let running = true;
  while (running) {
    const result = await menu('選擇操作:', [
      { name: chalk.green('▶  開始自動觀看'), value: 'run' },
      { name: chalk.cyan('📋 管理課程列表'), value: 'courses' },
      { name: chalk.yellow('📊 查看進度統計'), value: 'status' },
      { name: chalk.magenta('⚙  設定'), value: 'settings' },
      '__sep__',
      { name: chalk.gray('🚪 離開'), value: 'exit' }
    ]);

    const action = result?.value;
    if (!action || action === 'exit') { running = false; continue; }

    switch (action) {
      case 'run': await runMenu(); break;
      case 'courses': await courseMenu(); break;
      case 'status': {
        const { showStatus } = require('./index');
        await showStatus();
        await pressAnyKey();
        break;
      }
      case 'settings': await settingsMenu(); break;
    }
  }
  console.log(chalk.gray('\n再見！\n'));
}

async function runMenu() {
  const config = loadConfig();
  if (!config.courses.length) {
    draw([chalk.yellow('  還沒有設定課程，請先新增')]);
    await pressAnyKey();
    return;
  }

  const yes = await confirm(`開始觀看全部 ${config.courses.length} 個課程?`);
  if (!yes) return;

  const headless = await confirm('無頭模式（背景執行）?', false);
  if (headless === null) return;

  draw([
    '',
    chalk.green('  開始自動觀看'),
    `  課程: ${chalk.cyan(config.courses.length)} 個`,
    `  模式: ${headless ? chalk.gray('無頭') : chalk.white('有頭')}`,
    `  倍速: ${chalk.yellow(config.playbackRate || 2)}x`,
  ]);

  const { runWithSelection } = require('./index');
  await runWithSelection(config.courses, headless);
  await pressAnyKey();
}

async function courseMenu() {
  let editing = true;
  while (editing) {
    const config = loadConfig();
    const courses = config.courses || [];

    draw([chalk.cyan('  📋 課程列表')]);

    const result = await menu(`課程管理 (${courses.length} 個):`, [
      { name: chalk.green('➕ 新增課程'), value: 'add' },
      '__sep__',
      ...courses.map((url, i) => {
        const match = url.match(/\/course\/(\d+)\//);
        const id = match ? match[1] : '?';
        const name = (config.courseNames || {})[id];
        const label = name ? `${name} [${id}]` : `[${id}]`;
        return { name: `${chalk.red('✕')} 移除 ${label}`, value: `remove_${i}` };
      }),
      ...(courses.length > 0 ? [{ name: chalk.red('🗑  清空所有'), value: 'clear' }] : []),
      '__sep__',
      { name: chalk.gray('⬅ 返回'), value: 'back' }
    ]);

    const action = result?.value;
    if (!action || action === 'back') { editing = false; continue; }

    if (action === 'add') {
      const val = await input('輸入課程 ID 或 URL');
      if (val && val.trim()) {
        let url = val.trim();
        if (/^\d+$/.test(url)) url = `${BASE_URL}/course/${url}/content#/`;
        else if (!url.startsWith('http')) url = `${BASE_URL}/course/${url}/content#/`;
        config.courses.push(url);
        delete config.courseNames;
        saveConfig(config);
        draw([chalk.green('  已新增！')]);
        await pressAnyKey();
      }
    } else if (action === 'clear') {
      const yes = await confirm('確定要清空所有課程?', false);
      if (yes) {
        config.courses = [];
        config.courseNames = {};
        saveConfig(config);
        draw([chalk.green('  已清空')]);
        await pressAnyKey();
      }
    } else if (typeof action === 'string' && action.startsWith('remove_')) {
      const idx = parseInt(action.split('_')[1]);
      config.courses.splice(idx, 1);
      delete config.courseNames;
      saveConfig(config);
      draw([chalk.green('  已移除')]);
      await pressAnyKey();
    }
  }
}

async function settingsMenu() {
  const config = loadConfig();
  const speedOptions = [2, 1.5, 1.25, 1, 0.75];

  const result = await menu('設定:', [
    { name: `倍速: ${chalk.cyan(config.playbackRate || 2)}x`, value: 'speed' },
    { name: `無頭模式: ${chalk.cyan(config.headless ? '是' : '否')}`, value: 'headless' },
    { name: `SlowMo: ${chalk.cyan(config.slowMo || 50)}ms`, value: 'slowmo' },
    { name: `快取課程名稱: ${config.courseNames && Object.keys(config.courseNames).length > 0 ? chalk.green('已快取') + ` (${Object.keys(config.courseNames).length} 個)` : chalk.red('未快取')}`, value: 'cache' },
    '__sep__',
    { name: chalk.gray('⬅ 返回'), value: 'back' }
  ]);

  const action = result?.value;
  if (!action || action === 'back') return;

  if (action === 'speed') {
    const r = await menu('選擇播放倍速:', speedOptions.map(s => ({ name: `${s}x`, value: s })));
    const speed = r?.value;
    if (speed) {
      config.playbackRate = speed;
      saveConfig(config);
      draw([chalk.green(`  已設定為 ${speed}x`)]);
      await pressAnyKey();
    }
  } else if (action === 'headless') {
    const hl = await confirm('啟用無頭模式?', config.headless || false);
    if (hl !== null) {
      config.headless = hl;
      saveConfig(config);
    }
  } else if (action === 'slowmo') {
    const ms = await input('SlowMo 毫秒數');
    if (ms && !isNaN(parseInt(ms))) {
      config.slowMo = parseInt(ms);
      saveConfig(config);
    }
  } else if (action === 'cache') {
    draw([chalk.gray('  載入課程名稱...')]);
    const names = await fetchCourseNames(config);
    config.courseNames = names;
    saveConfig(config);
    draw([chalk.green(`  已快取 ${Object.keys(names).length} 個課程名稱`)]);
    await pressAnyKey();
  }
}

module.exports = { mainMenu };
