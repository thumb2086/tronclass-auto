const inquirer = require('inquirer');
const chalk = require('chalk');
const { loadConfig, saveConfig, BASE_URL } = require('./config');
const { loadCookies } = require('./auth');

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
      chalk.bold.white('tronclass-auto  v1.1.0'),
      chalk.gray('自動觀看 eclass/TronClass 影片'),
      '',
      `課程: ${chalk.cyan(config.courses.length + ' 個')}  |  Cookie: ${chalk.green('✓')}  |  倍速: ${chalk.yellow(config.playbackRate || 2)}x`,
    ]);
    console.log('');

    const { action } = await inquirer.prompt([{
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
    }]);

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

  const courseChoices = config.courses.map((url, i) => {
    const match = url.match(/\/course\/(\d+)\//);
    const id = match ? match[1] : '?';
    return { name: `[${id}] ${url}`, value: i, checked: true };
  });

  const { selectedCourses } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedCourses',
    message: '選擇要觀看的課程:',
    choices: courseChoices,
    validate: (ans) => ans.length > 0 ? true : '至少選一個課程'
  }]);

  const { headless } = await inquirer.prompt([{
    type: 'confirm',
    name: 'headless',
    message: '無頭模式（背景執行）?',
    default: false
  }]);

  console.log('');
  box([
    chalk.green('開始自動觀看'),
    `課程: ${chalk.cyan(selectedCourses.length)} 個`,
    `模式: ${headless ? chalk.gray('無頭') : chalk.white('有頭')}`,
    `倍速: ${chalk.yellow(config.playbackRate || 2)}x`,
  ]);
  console.log('');

  const { runWithSelection } = require('./index');
  await runWithSelection(selectedCourses.map(i => config.courses[i]), headless);
  await pressAnyKey();
}

async function courseMenu() {
  let editing = true;
  while (editing) {
    const config = loadConfig();
    const courses = config.courses || [];

    console.clear();
    box([
      chalk.bold.white('📋 課程列表'),
      ...(courses.length === 0
        ? [chalk.gray('  還沒有課程')]
        : courses.map((url, i) => {
            const match = url.match(/\/course\/(\d+)\//);
            const id = match ? match[1] : '?';
            return `  ${chalk.white(i + 1 + '.')} [${chalk.cyan(id)}] ${chalk.gray(url.substring(0, 45))}`;
          })),
      '',
      chalk.gray('  新增: tronclass course --add <ID或URL>'),
      chalk.gray('  移除: tronclass course --remove <編號>'),
    ]);
    console.log('');

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: `課程管理 (${courses.length} 個)`,
      choices: [
        { name: chalk.green('➕ 新增課程（互動式）'), value: 'add' },
        ...(courses.length > 0 ? [
          ...courses.map((url, i) => {
            const match = url.match(/\/course\/(\d+)\//);
            const id = match ? match[1] : '?';
            return { name: `${chalk.red('✕')} [${id}] 移除`, value: `remove_${i}` };
          }),
          new inquirer.Separator(),
          { name: chalk.red('🗑  清空所有'), value: 'clear' }
        ] : []),
        new inquirer.Separator(),
        { name: chalk.gray('⬅ 返回'), value: 'back' }
      ],
      pageSize: 20
    }]);

    if (action === 'back') {
      editing = false;
    } else if (action === 'add') {
      const { input } = await inquirer.prompt([{
        type: 'input',
        name: 'input',
        message: '輸入課程 ID（如 127331）或完整 URL:',
        validate: (v) => v.trim().length > 0 ? true : '不可為空'
      }]);
      const config2 = loadConfig();
      config2.courses = config2.courses || [];
      config2.courses.push(normalizeUrl(input.trim()));
      saveConfig(config2);
      console.log(chalk.green('  已新增！'));
    } else if (action === 'clear') {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm', name: 'confirm', message: '確定要清空所有課程?', default: false
      }]);
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
      console.log(chalk.green(`  已移除: ${removed}`));
    }
  }
}

async function settingsMenu() {
  const config = loadConfig();

  const { setting } = await inquirer.prompt([{
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
  }]);

  if (setting === 'back') return;

  if (setting === 'speed') {
    const { speed } = await inquirer.prompt([{
      type: 'list', name: 'speed', message: '選擇播放倍速:',
      choices: [
        { name: '1x（正常）', value: 1 },
        { name: '1.5x', value: 1.5 },
        { name: '2x（推薦）', value: 2 },
        { name: '4x', value: 4 },
        { name: '8x', value: 8 }
      ],
      default: config.playbackRate || 2
    }]);
    config.playbackRate = speed;
    saveConfig(config);
    console.log(chalk.green(`  已設定為 ${speed}x`));
  } else if (setting === 'headless') {
    const { hl } = await inquirer.prompt([{
      type: 'confirm', name: 'hl', message: '啟用無頭模式?', default: config.headless || false
    }]);
    config.headless = hl;
    saveConfig(config);
  } else if (setting === 'slowmo') {
    const { ms } = await inquirer.prompt([{
      type: 'number', name: 'ms', message: 'SlowMo 毫秒數:', default: config.slowMo || 50
    }]);
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
  await inquirer.prompt([{ type: 'input', name: '_', message: chalk.gray('按 Enter 返回...') }]);
}

module.exports = { mainMenu };
