const re = require;
const chalk = re('chalk');
const { loadCookies, autoLogin } = re('./auth');
const { watchVideo } = re('./video');
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
        result.push({
          id: a.id,
          title: (a.title || '').substring(0, 60),
          type: a.type || ''
        });
      }
    });
    return result;
  });
}

async function processCourse(page, courseId) {
  let done = 0;
  let skip = 0;

  const uncompleted = await getUncompleted(page, courseId);
  const videos = uncompleted.filter(u => u.type === 'online_video');

  const remaining = videos.filter(v => !isDone(courseId, v.id));
  console.log(chalk.cyan(`  Uncompleted videos: ${videos.length}, already done: ${videos.length - remaining.length}, remaining: ${remaining.length}`));

  for (const act of remaining) {
    console.log(chalk.white(`\n  -> ${act.title}`));
    const url = `${BASE_URL}/course/${courseId}/learning-activity/full-screen#/${act.id}`;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {}
    await page.waitForTimeout(5000);

    if (!page.url().includes('learning-activity')) {
      console.log(chalk.yellow('    [WARN] Failed to load activity page, skipping'));
      skip++;
      continue;
    }

    try {
      const success = await watchVideo(page);
      if (success) {
        markDone(courseId, act.id);
        done++;
        console.log(chalk.green('    [OK] Saved to progress'));
      } else {
        skip++;
      }
    } catch (e) {
      console.log(chalk.red(`    [ERROR] ${e.message}`));
      skip++;
    }

    await page.waitForTimeout(2000);
  }

  console.log(chalk.cyan(`\n  Result: ${done} watched, ${skip} skipped`));
  return { done, skip };
}

async function showStatus() {
  const config = loadConfig();
  const cookies = loadCookies();
  if (!cookies.length) {
    console.log(chalk.red('[ERROR] 沒有 Cookie，請先執行 eclass login 或 eclass import-cookies'));
    return;
  }

  const { chromium } = re('playwright');
  const browser = await chromium.launch({ headless: true, slowMo: 50 });
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
  console.log(chalk.cyan('\n=== 課程進度統計 ==='));

  for (const courseUrl of courses) {
    const match = courseUrl.match(/\/course\/(\d+)\//);
    const courseId = match ? match[1] : '?';
    try {
      const uncompleted = await getUncompleted(page, courseId);
      const total = uncompleted.length;
      const videos = uncompleted.filter(u => u.type === 'online_video').length;
      const exams = uncompleted.filter(u => u.type === 'exam').length;
      const other = total - videos - exams;
      console.log(chalk.white(`\n  Course ${courseId}: ${total} uncompleted (${videos} videos, ${exams} exams, ${other} other)`));
    } catch (e) {
      console.log(chalk.red(`\n  Course ${courseId}: ERROR - ${e.message}`));
    }
  }

  console.log('');
  await browser.close();
}

async function run(opts = {}) {
  const config = loadConfig();
  const cookies = loadCookies();

  if (!cookies.length) {
    console.log(chalk.red('[ERROR] 沒有 Cookie'));
    console.log(chalk.yellow('  請執行: eclass login        （自動取得 Cookie）'));
    console.log(chalk.yellow('  或:     eclass import-cookies "session=xxx"'));
    return;
  }

  if (opts.headless) config.headless = true;

  const { chromium } = re('playwright');

  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo || 50
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  if (page.url().includes('login')) {
    console.log(chalk.red('[ERROR] Cookie 過期，請重新執行 eclass login'));
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
    console.log(chalk.yellow('  請編輯 ~/.eclass-auto/config.json 加入 courses'));
    await browser.close();
    return;
  }

  let totalDone = 0;
  let totalSkip = 0;

  for (let i = 0; i < courses.length; i++) {
    const courseUrl = courses[i];
    const match = courseUrl.match(/\/course\/(\d+)\//);
    const courseId = match ? match[1] : '127331';

    console.log(chalk.cyan(`\n${'='.repeat(50)}`));
    console.log(chalk.cyan(`Course ${i + 1}/${courses.length} (ID: ${courseId})`));
    console.log(chalk.cyan(`${'='.repeat(50)}`));

    const result = await processCourse(page, courseId);
    totalDone += result.done;
    totalSkip += result.skip;
  }

  console.log(chalk.cyan(`\n${'='.repeat(50)}`));
  console.log(chalk.green(`ALL DONE: ${totalDone} watched, ${totalSkip} skipped`));
  console.log(chalk.cyan(`${'='.repeat(50)}`));

  await browser.close();
}

module.exports = { run, showStatus };
