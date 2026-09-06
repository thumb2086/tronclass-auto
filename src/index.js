const re = require;
const chalk = re('chalk');
const { loadCookies } = re('./auth');
const { watchVideo, formatTime, printReport } = re('./video');
const { loadConfig, saveConfig, markDone, isDone, BASE_URL } = re('./config');

async function getUncompleted(page, courseId) {
  try {
    await page.goto(`${BASE_URL}/course/${courseId}/content#/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
  } catch (e) {}
  await page.waitForTimeout(3000);

  return page.evaluate(() => {
    const el = document.querySelector('.learning-activities');
    if (!el) return [];
    const scope = angular.element(el).scope();
    if (!scope) return [];
    const activities = document.querySelectorAll('.learning-activity.sortable');
    const result = [];
    activities.forEach((actEl) => {
      const actScope = angular.element(actEl).scope();
      if (!actScope || !actScope.activity) return;
      const a = actScope.activity;
      let completeness = '';
      try { completeness = scope.getActivityCompleteness(a); } catch (e) {}
      if (completeness !== 'full') {
        let durationSec = 0;
        try {
          const durText = actEl.querySelector('.activity-attribute');
          if (durText) {
            const m = durText.textContent.match(/(\d{2}):(\d{2}):(\d{2})/);
            if (m) durationSec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
          }
        } catch (e) {}
        if (durationSec === 0) {
          try {
            const durScope = angular.element(actEl).scope();
            if (durScope && durScope.activity) {
              const d = durScope.activity.data;
              if (d && d.duration) durationSec = d.duration;
            }
          } catch (e) {}
        }
        result.push({
          id: a.id,
          title: (a.title || '').substring(0, 60),
          type: a.type || '',
          durationSec
        });
      }
    });
    return result;
  });
}

async function processCourse(page, courseId, stats) {
  let done = 0;
  let skip = 0;
  let fail = 0;

  const uncompleted = await getUncompleted(page, courseId);
  const videos = uncompleted.filter(u => u.type === 'online_video');
  const remaining = videos.filter(v => !isDone(courseId, v.id));

  console.log(chalk.cyan(`  Uncompleted: ${videos.length} videos, remaining: ${remaining.length}`));

  const totalDuration = remaining.reduce((sum, v) => sum + (v.durationSec || 120), 0);
  const estWatchTime = Math.ceil(totalDuration / 2) + remaining.length * 15;
  console.log(chalk.cyan(`  預估時間: ${formatTime(estWatchTime)}`));

  if (stats) {
    stats.remainingVideos = remaining.length;
    stats.estimatedTimeForRemaining = estWatchTime;
  }

  for (let i = 0; i < remaining.length; i++) {
    const act = remaining[i];
    console.log(chalk.white(`\n  [${i + 1}/${remaining.length}] ${act.title}`));

    const url = `${BASE_URL}/course/${courseId}/learning-activity/full-screen#/${act.id}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {}
    await page.waitForTimeout(5000);

    if (!page.url().includes('learning-activity')) {
      console.log(chalk.yellow('    [WARN] Failed to load activity page'));
      skip++;
      continue;
    }

    try {
      const thisDuration = Math.ceil((act.durationSec || 120) / 2) + 15;
      if (stats) {
        stats.remainingVideos = remaining.length - i - 1;
        stats.estimatedTimeForRemaining -= thisDuration;
        if (stats.estimatedTimeForRemaining < 0) stats.estimatedTimeForRemaining = 0;
      }
      const success = await watchVideo(page, stats);
      if (success) {
        markDone(courseId, act.id);
        done++;
        console.log(chalk.green('    [OK] Saved'));
      } else {
        fail++;
      }
    } catch (e) {
      console.log(chalk.red(`    [ERROR] ${e.message}`));
      fail++;
    }

    await page.waitForTimeout(2000);
  }

  console.log(chalk.cyan(`  Result: ${done} watched, ${skip} skipped, ${fail} failed`));
  return { done, skip, fail };
}

async function showStatus() {
  const config = loadConfig();
  const cookies = loadCookies();
  if (!cookies.length) {
    console.log(chalk.red('[ERROR] 沒有 Cookie，請先執行 tronclass login'));
    return;
  }

  const { chromium } = re('playwright');
  const { ensureBrowser } = re('./browser');
  const exePath = await ensureBrowser();
  const launchOpts = { headless: true, slowMo: 50 };
  if (exePath) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  if (page.url().includes('login')) {
    console.log(chalk.red('[ERROR] Cookie 過期'));
    await browser.close();
    return;
  }

  const courses = config.courses || [];
  console.log(chalk.cyan('\n┌' + '─'.repeat(48) + '┐'));
  console.log(chalk.cyan('│') + chalk.bold.white('  📋 課程進度統計' + ' '.repeat(30)) + chalk.cyan('│'));
  console.log(chalk.cyan('├' + '─'.repeat(48) + '┤'));

  let totalVideos = 0;
  let totalRemaining = 0;
  let totalExams = 0;

  for (const courseUrl of courses) {
    const match = courseUrl.match(/\/course\/(\d+)\//);
    const courseId = match ? match[1] : '?';
    try {
      const uncompleted = await getUncompleted(page, courseId);
      const videos = uncompleted.filter(u => u.type === 'online_video');
      const exams = uncompleted.filter(u => u.type === 'exam').length;
      const other = uncompleted.length - videos.length - exams;
      totalVideos += videos.length;
      totalRemaining += videos.length;
      totalExams += exams;

      const bar = generateBar(videos.length, 50);
      console.log(chalk.cyan('│') + `  [${courseId}] ${videos.length} videos ${exams} exams`.padEnd(50) + chalk.cyan('│'));
      console.log(chalk.cyan('│') + `    ${bar}`.padEnd(50) + chalk.cyan('│'));
    } catch (e) {
      console.log(chalk.cyan('│') + `  [${courseId}] ERROR`.padEnd(50) + chalk.cyan('│'));
    }
  }

  console.log(chalk.cyan('├' + '─'.repeat(48) + '┤'));
  console.log(chalk.cyan('│') + `  總計: ${totalRemaining} videos, ${totalExams} exams`.padEnd(50) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + `  預估時間: ${formatTime(totalRemaining * 120)}`.padEnd(50) + chalk.cyan('│'));
  console.log(chalk.cyan('└' + '─'.repeat(48) + '┘'));
  console.log('');

  await browser.close();
}

function generateBar(remaining, width) {
  if (remaining === 0) return chalk.green('█'.repeat(width) + ' 100%');
  const filled = Math.max(0, width - Math.min(remaining, width));
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ` ${remaining} remaining`;
}

async function launchBrowser(headless) {
  const { chromium } = re('playwright');
  const { ensureBrowser } = re('./browser');
  const exePath = await ensureBrowser();
  const launchOpts = { headless, slowMo: 50 };
  if (exePath) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  return { browser, context };
}

async function run(opts = {}) {
  const config = loadConfig();
  const cookies = loadCookies();

  if (!cookies.length) {
    console.log(chalk.red('[ERROR] 沒有 Cookie'));
    console.log(chalk.yellow('  請執行: tronclass login        （自動取得 Cookie）'));
    console.log(chalk.yellow('  或:     tronclass import-cookies "session=xxx"'));
    return;
  }

  if (opts.headless) config.headless = true;

  const { browser, context } = await launchBrowser(config.headless);
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  if (page.url().includes('login')) {
    console.log(chalk.red('[ERROR] Cookie 過期，請重新執行 tronclass login'));
    await browser.close();
    return;
  }

  console.log(chalk.green('[OK] Login verified'));

  let courses = config.courses || [];
  if (opts.course) {
    const ids = opts.course.split(',').map(s => s.trim());
    courses = courses.filter(url => ids.some(id => url.includes(id)));
    if (courses.length === 0) {
      courses = ids.map(id => `${BASE_URL}/course/${id}/content#/`);
    }
  }

  if (!courses.length) {
    console.log(chalk.yellow('[WARN] 沒有設定課程'));
    console.log(chalk.yellow('  請執行 tronclass course --add <課程ID>'));
    await browser.close();
    return;
  }

  await _runCourses(page, courses, browser);
}

async function runWithSelection(courseUrls, headless) {
  const config = loadConfig();
  const cookies = loadCookies();

  if (!cookies.length) {
    console.log(chalk.red('[ERROR] 沒有 Cookie'));
    return;
  }

  const { browser, context } = await launchBrowser(headless);
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  if (page.url().includes('login')) {
    console.log(chalk.red('[ERROR] Cookie 過期'));
    await browser.close();
    return;
  }

  console.log(chalk.green('[OK] Login verified\n'));

  await _runCourses(page, courseUrls, browser);
}

async function _runCourses(page, courses, browser) {
  const startTime = Date.now();
  const stats = {
    videosWatched: 0,
    videosSkipped: 0,
    videosFailed: 0,
    currentVideoDuration: 0,
    currentVideoElapsed: 0,
    remainingVideos: 0,
    estimatedTimeForRemaining: 0,
    totalElapsed: 0,
    timeSaved: 0,
    courseResults: []
  };

  for (let i = 0; i < courses.length; i++) {
    const courseUrl = courses[i];
    const match = courseUrl.match(/\/course\/(\d+)\//);
    const courseId = match ? match[1] : '?';

    console.log(chalk.cyan(`\n${'='.repeat(50)}`));
    console.log(chalk.cyan(`  Course ${i + 1}/${courses.length} (ID: ${courseId})`));
    console.log(chalk.cyan(`${'='.repeat(50)}`));

    const result = await processCourse(page, courseId, stats);
    stats.courseResults.push({ id: courseId, ...result });
    stats.videosWatched += result.done;
    stats.videosSkipped += result.skip;
    stats.videosFailed += result.fail;
  }

  stats.totalElapsed = Math.floor((Date.now() - startTime) / 1000);
  stats.timeSaved = Math.floor(stats.videosWatched * 60);

  printReport(stats);
  await browser.close();
}

module.exports = { run, runWithSelection, showStatus };
