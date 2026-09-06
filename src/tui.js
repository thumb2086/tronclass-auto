const inquirer = require('inquirer');
const chalk = require('chalk');
const { loadConfig, saveConfig, manageCourses } = require('./config');

async function mainMenu() {
  let running = true;

  while (running) {
    const config = loadConfig();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'tronclass-auto',
        choices: [
          { name: chalk.green('▶  開始自動觀看'), value: 'run' },
          { name: chalk.cyan('📋 管理課程列表'), value: 'courses' },
          { name: chalk.yellow('⚙  設定'), value: 'settings' },
          new inquirer.Separator(),
          { name: chalk.gray('🚪 離開'), value: 'exit' }
        ],
        pageSize: 10
      }
    ]);

    switch (action) {
      case 'run':
        await runMenu(config);
        break;
      case 'courses':
        await courseMenu(config);
        break;
      case 'settings':
        await settingsMenu(config);
        break;
      case 'exit':
        running = false;
        break;
    }
  }

  console.log(chalk.gray('\n再見！\n'));
}

async function runMenu(config) {
  if (!config.courses.length) {
    console.log(chalk.yellow('\n  還沒有設定課程，請先新增課程\n'));
    return;
  }

  const courseChoices = config.courses.map((url, i) => {
    const match = url.match(/\/course\/(\d+)\//);
    const id = match ? match[1] : '?';
    return { name: `[${id}] ${url}`, value: i, checked: true };
  });

  const { selectedCourses } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedCourses',
      message: '選擇要觀看的課程:',
      choices: courseChoices,
      validate: (ans) => ans.length > 0 ? true : '至少選一個課程'
    }
  ]);

  const { headless } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'headless',
      message: '無頭模式（背景執行）?',
      default: false
    }
  ]);

  console.log(chalk.cyan('\n' + '='.repeat(50)));
  console.log(chalk.cyan('  開始自動觀看'));
  console.log(chalk.cyan('='.repeat(50) + '\n'));

  const { runWithSelection } = require('./index');
  await runWithSelection(selectedCourses.map(i => config.courses[i]), headless);

  console.log(chalk.green('\n  按任意鍵回到選單'));
  await inquirer.prompt([{ type: 'input', name: '_press', message: '' }]);
}

async function courseMenu(config) {
  let editing = true;

  while (editing) {
    const courses = config.courses || [];
    const choices = courses.map((url, i) => {
      const match = url.match(/\/course\/(\d+)\//);
      const id = match ? match[1] : '?';
      return { name: `${chalk.white(i + 1 + '.')} [${id}] ${chalk.gray(url)}`, value: i };
    });

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `課程列表 (${courses.length} 個)`,
        choices: [
          ...choices,
          new inquirer.Separator(),
          { name: chalk.green('➕ 新增課程'), value: 'add' },
          { name: chalk.red('🗑  清空所有'), value: 'clear' },
          new inquirer.Separator(),
          { name: chalk.gray('⬅ 返回'), value: 'back' }
        ],
        pageSize: 20
      }
    ]);

    if (action === 'back') {
      editing = false;
    } else if (action === 'add') {
      const { input } = await inquirer.prompt([
        {
          type: 'input',
          name: 'input',
          message: '輸入課程 ID 或 URL:',
          validate: (v) => v.trim().length > 0 ? true : '不可為空'
        }
      ]);
      config.courses = config.courses || [];
      config.courses.push(normalizeUrl(input.trim()));
      saveConfig(config);
      console.log(chalk.green('  已新增！'));
    } else if (action === 'clear') {
      const { confirm } = await inquirer.prompt([
        { type: 'confirm', name: 'confirm', message: '確定要清空所有課程?', default: false }
      ]);
      if (confirm) {
        config.courses = [];
        saveConfig(config);
        console.log(chalk.green('  已清空'));
      }
    } else {
      const { subAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'subAction',
          message: courses[action],
          choices: [
            { name: chalk.red('🗑 移除此課程'), value: 'remove' },
            { name: chalk.gray('⬅ 返回'), value: 'back' }
          ]
        }
      ]);
      if (subAction === 'remove') {
        const removed = config.courses.splice(action, 1)[0];
        saveConfig(config);
        console.log(chalk.green(`  已移除: ${removed}`));
      }
    }
  }
}

async function settingsMenu(config) {
  const { setting } = await inquirer.prompt([
    {
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
    }
  ]);

  if (setting === 'back') return;

  if (setting === 'speed') {
    const { speed } = await inquirer.prompt([
      {
        type: 'list',
        name: 'speed',
        message: '選擇播放倍速:',
        choices: [
          { name: '1x（正常）', value: 1 },
          { name: '1.5x', value: 1.5 },
          { name: '2x（推薦）', value: 2 },
          { name: '4x', value: 4 },
          { name: '8x', value: 8 }
        ],
        default: config.playbackRate || 2
      }
    ]);
    config.playbackRate = speed;
    saveConfig(config);
    console.log(chalk.green(`  已設定為 ${speed}x`));
  } else if (setting === 'headless') {
    const { hl } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'hl',
        message: '啟用無頭模式?',
        default: config.headless || false
      }
    ]);
    config.headless = hl;
    saveConfig(config);
    console.log(chalk.green(`  無頭模式: ${hl ? '是' : '否'}`));
  } else if (setting === 'slowmo') {
    const { ms } = await inquirer.prompt([
      {
        type: 'number',
        name: 'ms',
        message: 'SlowMo 毫秒數:',
        default: config.slowMo || 50,
        validate: (v) => v >= 0 ? true : '不可小於 0'
      }
    ]);
    config.slowMo = ms;
    saveConfig(config);
    console.log(chalk.green(`  SlowMo: ${ms}ms`));
  }
}

function normalizeUrl(input) {
  if (input.match(/^\d+$/)) {
    return `https://eclass.yuntech.edu.tw/course/${input}/content#/`;
  }
  if (!input.startsWith('http')) {
    return `https://eclass.yuntech.edu.tw/course/${input}/content#/`;
  }
  return input;
}

module.exports = { mainMenu };
