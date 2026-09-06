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
  p[`${courseId}_${activityId}`] = true;
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

module.exports = {
  CONFIG_DIR, CONFIG_FILE, PROGRESS_FILE, COOKIE_FILE, SALT_FILE,
  BASE_URL, DEFAULT_CONFIG,
  ensureDir, loadConfig, saveConfig,
  loadProgress, saveProgress, markDone, isDone, showConfig
};
