const inquirer = require('inquirer');
const chalk = require('chalk');
const { loadConfig, saveConfig, BASE_URL } = require('./config');
const { loadCookies } = require('./auth');
const pkg = require('../package.json');

async function getCourseName(page, courseId) {
  try {
    await page.goto(`${BASE_URL}/course/${courseId}/content#/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(3000);
    return await page.evaluate(() => {
      const el = document.querySelector('.learning-activities');
      if (!el) return null;
      const scope = angular.element(el).scope();
      if (!scope) return null;
      return scope.course ? scope.course.title || scope.course.name : null;
    });
  } catch (e) {
    return null;
  }
}

async function withEsc(promptFn, onEsc) {
  let resolved = false;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const escHandler = (data) => {
    if (data.toString() === '\u001b' && !resolved) {
      resolved = true;
      process.stdin.removeListener('data', escHandler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      onEsc();
    }
  };
  process.stdin.on('data', escHandler);
  try {
    await promptFn();
  } finally {
    if (!resolved) {
      process.stdin.removeListener('data', escHandler);
    }
    resolved = true;
  }
}

function box(lines, width = 52) {
  const top = '╔' + '═'.repeat(width - 2) + '╗';
  const bot = '╚' + '═'.repeat(width - 2) + '╝';
  const pad = (s) => '║ ' + s.padEnd(width - 4) + ' ║';
  console.log(chalk.cyan(top));
  lines.forEach(l => console.log(chalk.cyan(pad(l))));
  console.log(chalk.cyan(bot));
}

async function mainMenu() {
  const cookies = loadCookies();
  if (!cookies.length) {
    console.log(chalk.red('\n  沒有 Cookie，請先執行 tronclass login\n'));
    return;
  }

  let running = true;
  while (running) {
    console.clear();
    const config = loadConfig();

    box([
      chalk.bold.white(`tronclass-auto  v${pkg.version}`),
      chalk.gray('自動觀看 eclass/TronClass 影片'),
      '',
      `課程: ${chalk.cyan(config.courses.length + ' 個')}  |  Cookie: ${chalk.green('✓')}  |  倍速: ${chalk.yellow(config.playbackRate || 2)}x`,
    ]);
    console.log('');

    const { action } = await new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const escHandler = (data) => {
        if (data.toString() === '\u001b') {
          process.stdin.removeListener('data', escHandler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve({ action: 'exit' });
        }
      };
      process.stdin.on('data', escHandler);
      inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: '選擇操作:',
        choices: [
          { name: chalk.green('▶  開始自動觀看'), value: 'run' },
          { name: chalk.cyan('📋 管理課程列表'), value: 'courses' },
          { name: chalk.yellow('📊 查看進度統計'), value: 'status' },
          { name: chalk.magenta('⚙  設定'), value: 'settings' },
          new inquirer.Separator(),
          { name: chalk.gray('🚪 離開'), value: 'exit' }
        ],
        pageSize: 10
      }]).then(ans => {
        process.stdin.removeListener('data', escHandler);
        resolve(ans);
      });
    });

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

  const { confirm } = await new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const escHandler = (data) => {
      if (data.toString() === '\u001b') {
        process.stdin.removeListener('data', escHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve({ confirm: false });
      }
    };
    process.stdin.on('data', escHandler);
    inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `開始觀看全部 ${config.courses.length} 個課程?`,
      default: true
    }]).then(ans => {
      process.stdin.removeListener('data', escHandler);
      resolve(ans);
    });
  });
  if (!confirm) return;

  const { headless } = await new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const escHandler = (data) => {
      if (data.toString() === '\u001b') {
        process.stdin.removeListener('data', escHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve({ headless: false });
      }
    };
    process.stdin.on('data', escHandler);
    inquirer.prompt([{
      type: 'confirm',
      name: 'headless',
      message: '無頭模式（背景執行）?',
      default: false
    }]).then(ans => {
      process.stdin.removeListener('data', escHandler);
      resolve(ans);
    });
  });

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
  const { chromium } = require('playwright');
  const { ensureBrowser } = require('./browser');
  let browser = null;

  async function getPage() {
    if (!browser) {
      const { loadCookies } = require('./auth');
      const cookies = loadCookies();
      const exePath = await ensureBrowser();
      const launchOpts = { headless: true, slowMo: 50, args: ['--disable-gpu', '--disable-software-rasterizer'] };
      if (exePath) launchOpts.executablePath = exePath;
      browser = await chromium.launch(launchOpts);
      const context = await browser.newContext();
      await context.addCookies(cookies);
      return await context.newPage();
    }
    return browser.newPage();
  }

  let courseNames = {};

  async function loadCourseNames(courses) {
    console.log(chalk.gray('  載入課程名稱...'));
    const page = await getPage();
    for (const url of courses) {
      const match = url.match(/\/course\/(\d+)\//);
      const id = match ? match[1] : null;
      if (id && !courseNames[id]) {
        const name = await getCourseName(page, id);
        if (name) courseNames[id] = name;
      }
    }
    try { await page.close(); } catch (e) {}
  }

  try {
    while (editing) {
      const config = loadConfig();
      const courses = config.courses || [];

      await loadCourseNames(courses);

      console.clear();
      box([
        chalk.bold.white('📋 課程列表'),
        ...(courses.length === 0
          ? [chalk.gray('  還沒有課程')]
          : courses.map((url, i) => {
              const match = url.match(/\/course\/(\d+)\//);
              const id = match ? match[1] : '?';
              const name = courseNames[id] || null;
              if (name) {
                return `  ${chalk.white(i + 1 + '.')} ${chalk.cyan(name)} ${chalk.gray(`[${id}]`)}`;
              }
              return `  ${chalk.white(i + 1 + '.')} [${chalk.cyan(id)}] ${chalk.gray(url.substring(0, 45))}`;
            })),
        '',
        chalk.gray('  新增: tronclass course --add <ID或URL>'),
        chalk.gray('  移除: tronclass course --remove <編號>'),
        chalk.gray('  ESC 返回'),
      ]);
      console.log('');

      const { action } = await new Promise((resolve) => {
        const listChoices = [
          { name: chalk.green('➕ 新增課程（互動式）'), value: 'add' },
          ...(courses.length > 0 ? [
            ...courses.map((url, i) => {
              const match = url.match(/\/course\/(\d+)\//);
              const id = match ? match[1] : '?';
              const name = courseNames[id] || null;
              const label = name ? `${name} [${id}]` : `[${id}]`;
              return { name: `${chalk.red('✕')} 移除 ${label}`, value: `remove_${i}` };
            }),
            new inquirer.Separator(),
            { name: chalk.red('🗑  清空所有'), value: 'clear' }
          ] : []),
          new inquirer.Separator(),
          { name: chalk.gray('⬅ 返回'), value: 'back' }
        ];

        process.stdin.setRawMode(true);
        process.stdin.resume();
        const escHandler = (data) => {
          if (data.toString() === '\u001b') {
            process.stdin.removeListener('data', escHandler);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            resolve({ action: 'back' });
          }
        };
        process.stdin.on('data', escHandler);

        inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: `課程管理 (${courses.length} 個)`,
          choices: listChoices,
          pageSize: 20
        }]).then(ans => {
          process.stdin.removeListener('data', escHandler);
          resolve(ans);
        });
      });

      if (action === 'back') {
        editing = false;
      } else if (action === 'add') {
        const { input } = await new Promise((resolve) => {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          const escHandler = (data) => {
            if (data.toString() === '\u001b') {
              process.stdin.removeListener('data', escHandler);
              process.stdin.setRawMode(false);
              process.stdin.pause();
              resolve({ input: '' });
            }
          };
          process.stdin.on('data', escHandler);
          inquirer.prompt([{
            type: 'input',
            name: 'input',
            message: '輸入課程 ID（如 127331）或完整 URL:',
            validate: (v) => v.trim().length > 0 ? true : '不可為空'
          }]).then(ans => {
            process.stdin.removeListener('data', escHandler);
            resolve(ans);
          });
        });
        if (input) {
          const config2 = loadConfig();
          config2.courses = config2.courses || [];
          config2.courses.push(normalizeUrl(input.trim()));
          saveConfig(config2);
          console.log(chalk.green('  已新增！'));
        }
      } else if (action === 'clear') {
        const { confirm } = await new Promise((resolve) => {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          const escHandler = (data) => {
            if (data.toString() === '\u001b') {
              process.stdin.removeListener('data', escHandler);
              process.stdin.setRawMode(false);
              process.stdin.pause();
              resolve({ confirm: false });
            }
          };
          process.stdin.on('data', escHandler);
          inquirer.prompt([{
            type: 'confirm', name: 'confirm', message: '確定要清空所有課程?', default: false
          }]).then(ans => {
            process.stdin.removeListener('data', escHandler);
            resolve(ans);
          });
        });
        if (confirm) {
          const config2 = loadConfig();
          config2.courses = [];
          saveConfig(config2);
          console.log(chalk.green('  已清空'));
        }
      } else if (action.startsWith('remove_')) {
        const idx = parseInt(action.split('_')[1]);
        const config2 = loadConfig();
        const removed = config2.courses.splice(idx, 1)[0];
        saveConfig(config2);
        courseNames = {};
        console.log(chalk.green(`  已移除: ${removed}`));
      }
    }
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

async function settingsMenu() {
  const config = loadConfig();

  const { setting } = await new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const escHandler = (data) => {
      if (data.toString() === '\u001b') {
        process.stdin.removeListener('data', escHandler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve({ setting: 'back' });
      }
    };
    process.stdin.on('data', escHandler);
    inquirer.prompt([{
      type: 'list',
      name: 'setting',
      message: '設定',
      choices: [
        { name: `倍速: ${chalk.cyan(config.playbackRate || 2)}x`, value: 'speed' },
        { name: `無頭模式: ${chalk.cyan(config.headless ? '是' : '否')}`, value: 'headless' },
        { name: `SlowMo: ${chalk.cyan(config.slowMo || 50)}ms`, value: 'slowmo' },
        new inquirer.Separator(),
        { name: chalk.gray('⬅ 返回'), value: 'back' }
      ]
    }]).then(ans => {
      process.stdin.removeListener('data', escHandler);
      resolve(ans);
    });
  });

  if (setting === 'back') return;

  if (setting === 'speed') {
    const { speed } = await new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const escHandler = (data) => {
        if (data.toString() === '\u001b') {
          process.stdin.removeListener('data', escHandler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve({ speed: config.playbackRate || 2 });
        }
      };
      process.stdin.on('data', escHandler);
      inquirer.prompt([{
        type: 'list', name: 'speed', message: '選擇播放倍速:',
        choices: [
          { name: '1x（正常）', value: 1 },
          { name: '1.5x', value: 1.5 },
          { name: '2x（推薦）', value: 2 },
          { name: '4x', value: 4 },
          { name: '8x', value: 8 }
        ],
        default: config.playbackRate || 2
      }]).then(ans => {
        process.stdin.removeListener('data', escHandler);
        resolve(ans);
      });
    });
    config.playbackRate = speed;
    saveConfig(config);
    console.log(chalk.green(`  已設定為 ${speed}x`));
  } else if (setting === 'headless') {
    const { hl } = await new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const escHandler = (data) => {
        if (data.toString() === '\u001b') {
          process.stdin.removeListener('data', escHandler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve({ hl: config.headless || false });
        }
      };
      process.stdin.on('data', escHandler);
      inquirer.prompt([{
        type: 'confirm', name: 'hl', message: '啟用無頭模式?', default: config.headless || false
      }]).then(ans => {
        process.stdin.removeListener('data', escHandler);
        resolve(ans);
      });
    });
    config.headless = hl;
    saveConfig(config);
  } else if (setting === 'slowmo') {
    const { ms } = await new Promise((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const escHandler = (data) => {
        if (data.toString() === '\u001b') {
          process.stdin.removeListener('data', escHandler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve({ ms: config.slowMo || 50 });
        }
      };
      process.stdin.on('data', escHandler);
      inquirer.prompt([{
        type: 'number', name: 'ms', message: 'SlowMo 毫秒數:', default: config.slowMo || 50
      }]).then(ans => {
        process.stdin.removeListener('data', escHandler);
        resolve(ans);
      });
    });
    config.slowMo = ms;
    saveConfig(config);
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

async function pressAnyKey() {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const handler = (data) => {
      const str = data.toString();
      if (str === '\u001b' || str === '\r' || str === '\n') {
        process.stdin.removeListener('data', handler);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      }
    };
    process.stdin.on('data', handler);
    process.stdout.write(chalk.gray('按 Enter 或 ESC 返回...'));
  });
}

module.exports = { mainMenu };
