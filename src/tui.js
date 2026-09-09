const readline = require('readline');
const chalk = require('chalk');
const { loadConfig, saveConfig, BASE_URL } = require('./config');
const { loadCookies } = require('./auth');
const pkg = require('../package.json');

function box(lines, width = 52) {
  console.log(chalk.cyan('╔' + '═'.repeat(width - 2) + '╗'));
  lines.forEach(l => console.log(chalk.cyan('║ ') + l.padEnd(width - 4) + chalk.cyan(' ║')));
  console.log(chalk.cyan('╚' + '═'.repeat(width - 2) + '╝'));
}

function promptList(message, choices, header) {
  return new Promise((resolve) => {
    let selected = 0;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    function render() {
      const lines = [];
      choices.forEach((c, i) => {
        const prefix = i === selected ? chalk.green('>') : ' ';
        if (typeof c === 'string' && c === '__sep__') {
          lines.push(chalk.gray('  ─────────────'));
        } else {
          const label = typeof c === 'string' ? c : c.name;
          lines.push(`  ${prefix} ${label}`);
        }
      });
      lines.push('');
      lines.push(chalk.gray('  ↑↓ 移動  Enter 確認  ESC 返回'));

      const headerLines = header || [];
      process.stdout.write('\x1B[2J\x1B[H');
      headerLines.forEach(l => process.stdout.write(l + '\n'));
      lines.forEach(l => process.stdout.write(l + '\n'));
    }

    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(data) {
      const key = data.toString();

      if (key === '\u001b[A') {
        selected = Math.max(0, selected - 1);
        while (selected < choices.length && (typeof choices[selected] === 'string' || choices[selected].value === '__sep__')) {
          selected = Math.max(0, selected - 1);
        }
        render();
      } else if (key === '\u001b[B') {
        selected = Math.min(choices.length - 1, selected + 1);
        while (selected < choices.length && (typeof choices[selected] === 'string' || choices[selected].value === '__sep__')) {
          selected = Math.min(choices.length - 1, selected + 1);
        }
        render();
      } else if (key === '\r' || key === '\n') {
        cleanup();
        const choice = choices[selected];
        resolve(typeof choice === 'string' ? choice : choice.value);
      } else if (key === '\u001b') {
        cleanup();
        resolve('__esc__');
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      rl.close();
    }

    process.stdin.on('data', onData);
  });
}

function promptConfirm(message, defaultVal = true) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(`  ${message} (${defaultVal ? 'Y/n' : 'y/N'}) `);

    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(data) {
      const key = data.toString();
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(defaultVal);
      } else if (key === '\u001b') {
        cleanup();
        resolve(null);
      } else if (key.toLowerCase() === 'y') {
        cleanup();
        resolve(true);
      } else if (key.toLowerCase() === 'n') {
        cleanup();
        resolve(false);
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      rl.close();
    }

    process.stdin.on('data', onData);
  });
}

function promptInput(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${message}: `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function pressAnyKey() {
  return new Promise((resolve) => {
    process.stdout.write(chalk.gray('\n  按任意鍵返回...'));
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });
}

function headerLines() {
  const config = loadConfig();
  return [
    '',
    chalk.white('╔' + '═'.repeat(52) + '╗'),
    chalk.white('║ ') + chalk.bold.white(`tronclass-auto  v${pkg.version}`.padEnd(52)) + chalk.white('║'),
    chalk.white('║ ') + chalk.gray('自動觀看 eclass/TronClass 影片'.padEnd(52)) + chalk.white('║'),
    chalk.white('║ ') + `課程: ${chalk.cyan(config.courses.length)} 個  |  Cookie: ${chalk.green('✓')}  |  倍速: ${chalk.yellow(config.playbackRate || 2)}x`.padEnd(52) + chalk.white('║'),
    chalk.white('╚' + '═'.repeat(52) + '╝'),
  ];
}

async function mainMenu() {
  const cookies = loadCookies();
  if (!cookies.length) {
    console.log(chalk.red('\n  沒有 Cookie，請先執行 tronclass login\n'));
    return;
  }

  let running = true;
  while (running) {
    const action = await promptList('選擇操作:', [
      { name: chalk.green('▶  開始自動觀看'), value: 'run' },
      { name: chalk.cyan('📋 管理課程列表'), value: 'courses' },
      { name: chalk.yellow('📊 查看進度統計'), value: 'status' },
      { name: chalk.magenta('⚙  設定'), value: 'settings' },
      '__sep__',
      { name: chalk.gray('🚪 離開'), value: 'exit' }
    ], headerLines());

    if (action === '__esc__') { running = false; continue; }

    switch (action) {
      case 'run': await runMenu(config); break;
      case 'courses': await courseMenu(); break;
      case 'status': {
        const { showStatus } = require('./index');
        await showStatus();
        await pressAnyKey();
        break;
      }
      case 'settings': await settingsMenu(); break;
      case 'exit': running = false; break;
    }
  }
  console.log(chalk.gray('\n再見！\n'));
}

async function runMenu(config) {
  if (!config.courses.length) {
    console.log(chalk.yellow('\n  還沒有設定課程，請先新增\n'));
    await pressAnyKey();
    return;
  }

  const confirm = await promptConfirm(`開始觀看全部 ${config.courses.length} 個課程?`);
  if (!confirm) return;

  const headless = await promptConfirm('無頭模式（背景執行）?', false);
  if (headless === null) return;

  console.log('');
  box([
    chalk.green('開始自動觀看'),
    `課程: ${chalk.cyan(config.courses.length)} 個`,
    `模式: ${headless ? chalk.gray('無頭') : chalk.white('有頭')}`,
    `倍速: ${chalk.yellow(config.playbackRate || 2)}x`,
  ]);
  console.log('');

  const { runWithSelection } = require('./index');
  await runWithSelection(config.courses, headless);
  await pressAnyKey();
}

async function courseMenu() {
  let editing = true;
  while (editing) {
    const config = loadConfig();
    const courses = config.courses || [];

    process.stdout.write('\x1B[2J\x1B[H');

    let courseNames = {};
    if (courses.length > 0) {
      process.stdout.write(chalk.gray('  載入課程名稱...\n'));
      try {
        const { chromium } = require('playwright');
        const cookies = loadCookies();
        if (cookies.length > 0) {
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
          results.forEach(r => { if (r.name) courseNames[r.id] = r.name; });
          await pg.close();
          await browser.close();
        }
      } catch (e) {}
    }

    process.stdout.write('\x1B[2J\x1B[H');
    drawHeader();

    const choices = [
      { name: chalk.green('➕ 新增課程'), value: 'add' },
      '__sep__',
    ];
    courses.forEach((url, i) => {
      const match = url.match(/\/course\/(\d+)\//);
      const id = match ? match[1] : '?';
      const name = courseNames[id];
      const label = name ? `${name} [${id}]` : `[${id}]`;
      choices.push({ name: `${chalk.red('✕')} 移除 ${label}`, value: `remove_${i}` });
    });
    if (courses.length > 0) {
      choices.push({ name: chalk.red('🗑  清空所有'), value: 'clear' });
    }
    choices.push('__sep__');
    choices.push({ name: chalk.gray('⬅ 返回'), value: 'back' });

    const courseHeader = [
      ...headerLines(),
      chalk.cyan('┌' + '─'.repeat(50) + '┐'),
      chalk.cyan('│') + chalk.bold.white('  📋 課程列表' + ' '.repeat(39)) + chalk.cyan('│'),
      chalk.cyan('├' + '─'.repeat(50) + '┤'),
      ...courses.map((url, i) => {
        const match = url.match(/\/course\/(\d+)\//);
        const id = match ? match[1] : '?';
        const name = courseNames[id] || '';
        const display = name ? `${chalk.white(i + 1 + '.')} ${chalk.cyan(name)} [${id}]` : `${chalk.white(i + 1 + '.')} [${chalk.cyan(id)}]`;
        return chalk.cyan('│') + '  ' + display + ' '.repeat(Math.max(1, 48 - name.length - id.length - 4)) + chalk.cyan('│');
      }),
      chalk.cyan('└' + '─'.repeat(50) + '┘'),
    ];

    const action = await promptList(`課程管理 (${courses.length} 個):`, choices, courseHeader);

    if (action === '__esc__' || action === 'back') {
      editing = false;
    } else if (action === 'add') {
      const input = await promptInput('輸入課程 ID 或 URL');
      if (input && input.trim()) {
        config.courses = config.courses || [];
        config.courses.push(normalizeUrl(input.trim()));
        saveConfig(config);
        console.log(chalk.green('  已新增！'));
        await pressAnyKey();
      }
    } else if (action === 'clear') {
      const confirm = await promptConfirm('確定要清空所有課程?', false);
      if (confirm) {
        config.courses = [];
        saveConfig(config);
        console.log(chalk.green('  已清空'));
        await pressAnyKey();
      }
    } else if (typeof action === 'string' && action.startsWith('remove_')) {
      const idx = parseInt(action.split('_')[1]);
      const removed = config.courses.splice(idx, 1)[0];
      saveConfig(config);
      console.log(chalk.green(`  已移除: ${removed}`));
      await pressAnyKey();
    }
  }
}

async function settingsMenu() {
  const config = loadConfig();

  const setting = await promptList('設定:', [
    { name: `倍速: ${chalk.cyan(config.playbackRate || 2)}x`, value: 'speed' },
    { name: `無頭模式: ${chalk.cyan(config.headless ? '是' : '否')}`, value: 'headless' },
    { name: `SlowMo: ${chalk.cyan(config.slowMo || 50)}ms`, value: 'slowmo' },
    '__sep__',
    { name: chalk.gray('⬅ 返回'), value: 'back' }
  ], [...headerLines(), '', chalk.white('╔' + '═'.repeat(50) + '╗'), chalk.white('║') + chalk.bold.white('  ⚙  設定'.padEnd(50)) + chalk.white('║'), chalk.white('╚' + '═'.repeat(50) + '╝')]);

  if (setting === '__esc__' || setting === 'back') return;

  if (setting === 'speed') {
    const speed = await promptList('選擇播放倍速:', [
      { name: '2x', value: 2 },
      { name: '1.5x', value: 1.5 },
      { name: '1.25x', value: 1.25 },
      { name: '1x', value: 1 },
      { name: '0.75x', value: 0.75 },
    ]);
    if (speed !== '__esc__') {
      config.playbackRate = speed;
      saveConfig(config);
      console.log(chalk.green(`  已設定為 ${speed}x`));
    }
  } else if (setting === 'headless') {
    const hl = await promptConfirm('啟用無頭模式?', config.headless || false);
    if (hl !== null) {
      config.headless = hl;
      saveConfig(config);
    }
  } else if (setting === 'slowmo') {
    const ms = await promptInput('SlowMo 毫秒數');
    if (ms && !isNaN(parseInt(ms))) {
      config.slowMo = parseInt(ms);
      saveConfig(config);
    }
  }
}

function normalizeUrl(input) {
  if (/^\d+$/.test(input)) {
    return `${BASE_URL}/course/${input}/content#/`;
  }
  if (!input.startsWith('http')) {
    return `${BASE_URL}/course/${input}/content#/`;
  }
  return input;
}

module.exports = { mainMenu };
