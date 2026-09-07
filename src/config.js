const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const CONFIG_DIR = path.join(require('os').homedir(), '.eclass-auto');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PROGRESS_FILE = path.join(CONFIG_DIR, 'progress.json');
const COOKIE_FILE = path.join(CONFIG_DIR, 'cookies.enc');
const SALT_FILE = path.join(CONFIG_DIR, 'salt.bin');

const BASE_URL = 'https://eclass.yuntech.edu.tw';

const DEFAULT_CONFIG = {
  headless: false,
  slowMo: 50,
  playbackRate: 2,
  videoTimeout: 600,
  courses: [],
  formAnswers: {}
};

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureDir();
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function loadProgress() {
  ensureDir();
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {};
}

function saveProgress(data) {
  ensureDir();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function markDone(courseId, activityId) {
  const p = loadProgress();
  p[`${courseId}_${activityId}`] = 'done';
  saveProgress(p);
}

function markLocked(courseId, activityId) {
  const p = loadProgress();
  p[`${courseId}_${activityId}`] = 'locked';
  saveProgress(p);
}

function isDone(courseId, activityId) {
  const p = loadProgress();
  return `${courseId}_${activityId}` in p;
}

function showConfig() {
  const config = loadConfig();
  console.log(chalk.cyan('\n=== 目前設定 ==='));
  console.log(`  headless: ${config.headless}`);
  console.log(`  playbackRate: ${config.playbackRate}x`);
  console.log(`  courses: ${config.courses.length} 個`);
  config.courses.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  console.log(`  config: ${CONFIG_FILE}`);
  console.log(`  progress: ${PROGRESS_FILE}\n`);
}

function normalizeUrl(url) {
  url = url.trim();
  if (url.match(/^\d+$/)) {
    return `${BASE_URL}/course/${url}/content#/`;
  }
  if (!url.startsWith('http')) {
    return `${BASE_URL}/course/${url}/content#/`;
  }
  if (!url.endsWith('#/') && !url.endsWith('#')) {
    if (url.includes('content')) {
      url = url.replace(/\/?$/, '/#/');
    }
  }
  return url;
}

function manageCourses(opts) {
  const config = loadConfig();

  if (opts.add) {
    const url = normalizeUrl(opts.add);
    config.courses.push(url);
    saveConfig(config);
    console.log(chalk.green(`[OK] 已新增課程`));
    console.log(chalk.white(`  ${url}`));
    console.log(chalk.gray(`  目前共 ${config.courses.length} 個課程`));
    return;
  }

  if (opts.remove) {
    const idx = parseInt(opts.remove, 10) - 1;
    if (idx < 0 || idx >= config.courses.length) {
      console.log(chalk.red(`[ERROR] 編號 ${opts.remove} 不存在`));
      console.log(chalk.gray(`  目前共 ${config.courses.length} 個課程，請輸入 1~${config.courses.length}`));
      return;
    }
    const removed = config.courses.splice(idx, 1)[0];
    saveConfig(config);
    console.log(chalk.green(`[OK] 已移除課程`));
    console.log(chalk.gray(`  ${removed}`));
    console.log(chalk.gray(`  目前共 ${config.courses.length} 個課程`));
    return;
  }

  if (opts.clear) {
    config.courses = [];
    saveConfig(config);
    console.log(chalk.green('[OK] 已清空所有課程'));
    return;
  }

  if (opts.list || (!opts.add && !opts.remove && !opts.clear)) {
    if (config.courses.length === 0) {
      console.log(chalk.yellow('\n  目前沒有設定任何課程'));
      console.log(chalk.gray('  使用方法:'));
      console.log(chalk.gray('    tronclass course --add <課程ID或URL>'));
      console.log(chalk.gray('    tronclass course --add 127331'));
      console.log(chalk.gray('    tronclass course --add https://eclass.yuntech.edu.tw/course/127331/content#/'));
      console.log('');
      return;
    }
    console.log(chalk.cyan('\n=== 課程列表 ==='));
    config.courses.forEach((c, i) => {
      const match = c.match(/\/course\/(\d+)\//);
      const id = match ? match[1] : '?';
      console.log(chalk.white(`  ${i + 1}. [${id}] ${c}`));
    });
    console.log(chalk.gray(`\n  共 ${config.courses.length} 個課程\n`));
    console.log(chalk.gray('  操作:'));
    console.log(chalk.gray('    tronclass course --add <ID或URL>  新增'));
    console.log(chalk.gray('    tronclass course --remove <編號>   移除'));
    console.log(chalk.gray('    tronclass course --clear           清空'));
    console.log('');
  }
}

module.exports = {
  CONFIG_DIR, CONFIG_FILE, PROGRESS_FILE, COOKIE_FILE, SALT_FILE,
  BASE_URL, DEFAULT_CONFIG,
  ensureDir, loadConfig, saveConfig,
  loadProgress, saveProgress, markDone, markLocked, isDone, showConfig, manageCourses
};
