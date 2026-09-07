const chalk = require('chalk');

function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function watchVideo(page, stats) {
  const hasVideo = await page.evaluate(() => document.querySelector('video') !== null);
  if (!hasVideo) {
    log(chalk.yellow('  No video element'));
    return false;
  }

  log(chalk.blue('  Muted + 2x'));

  await page.evaluate(() => {
    document.querySelectorAll('video').forEach(v => {
      v.muted = true;
      v.playbackRate = 2;
      v.currentTime = 0;
    });
  });

  await page.evaluate(() => document.querySelector('video').play());
  await page.waitForTimeout(2000);

  const isPlaying = await page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? !v.paused : false;
  });

  if (!isPlaying) {
    log(chalk.yellow('  Clicking play...'));
    await page.evaluate(() => {
      document.querySelectorAll('[class*="play"], .vjs-big-play-button, button').forEach(btn => {
        if (btn.offsetParent && (btn.className.includes('play') || btn.className.includes('Play'))) {
          btn.click();
        }
      });
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.querySelector('video').play());
  }

  const duration = await page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? v.duration : 0;
  });

  if (!duration || duration <= 0) {
    log(chalk.yellow('  Cannot get duration, waiting 30s...'));
    await page.waitForTimeout(30000);
    if (stats) stats.videosWatched++;
    return true;
  }

  const waitTime = (duration / 2) + 15;
  log(chalk.blue(`  ${formatTime(duration)} video → ~${formatTime(waitTime)} (2x)`));

  if (stats) {
    stats.currentVideoDuration = duration / 2;
    stats.currentVideoElapsed = 0;
  }

  let elapsed = 0;
  let lastPct = -1;
  let restartCount = 0;

  while (elapsed < waitTime) {
    await page.waitForTimeout(5000);
    elapsed += 5;

    if (stats) stats.currentVideoElapsed = elapsed;

    const state = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.duration) return { p: 100, e: true, paused: false, stalled: false };
      return {
        p: Math.floor((v.currentTime / v.duration) * 100),
        e: v.ended || v.currentTime >= v.duration - 2,
        paused: v.paused,
        stalled: v.readyState < 2
      };
    });

    if (state.p > lastPct) {
      const pct = state.p;
      const barWidth = 20;
      const filled = Math.floor(barWidth * pct / 100);
      const empty = barWidth - filled;
      const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
      const remaining = Math.max(0, waitTime - elapsed);
      let etaStr = '';
      if (stats && stats.remainingVideos > 0) {
        const totalRemaining = remaining + stats.estimatedTimeForRemaining;
        etaStr = chalk.gray(` | ETA ${formatTime(totalRemaining)}`);
      } else {
        etaStr = chalk.gray(` | ${formatTime(remaining)} left`);
      }
      log(chalk.blue(`  ${bar} ${String(pct).padStart(3)}%  (${formatTime(elapsed)})${etaStr}`));
      lastPct = pct;
    }

    if (state.e) {
      log(chalk.green('  Done ✓'));
      break;
    }

    if (state.stalled) {
      if (elapsed % 15 === 0) {
        log(chalk.gray(`  Buffering... (${formatTime(elapsed)})`));
      }
      continue;
    }

    if (state.paused && !state.stalled && elapsed > 10) {
      await page.waitForTimeout(3000);
      const stillPaused = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.paused : false;
      });
      if (!stillPaused) continue;

      restartCount++;
      if (restartCount > 10) {
        log(chalk.red('  Too many restarts, giving up'));
        return false;
      }
      log(chalk.yellow(`  Paused, restarting (#${restartCount})...`));
      await page.evaluate(() => document.querySelector('video').play());
      await page.waitForTimeout(1000);
    }
  }

  await page.waitForTimeout(3000);
  if (stats) stats.videosWatched++;
  return true;
}

function log(msg) {
  console.log(msg);
}

function printReport(stats) {
  console.log('');
  console.log(chalk.cyan('┌' + '─'.repeat(48) + '┐'));
  console.log(chalk.cyan('│') + chalk.bold.white('  📊 報表' + ' '.repeat(39)) + chalk.cyan('│'));
  console.log(chalk.cyan('├' + '─'.repeat(48) + '┤'));
  console.log(chalk.cyan('│') + `  已觀看: ${chalk.green(stats.videosWatched + ' 部')}`.padEnd(50) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + `  已跳過: ${chalk.yellow(stats.videosSkipped + ' 部')}`.padEnd(50) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + `  失敗:   ${chalk.red(stats.videosFailed + ' 部')}`.padEnd(50) + chalk.cyan('│'));
  console.log(chalk.cyan('├' + '─'.repeat(48) + '┤'));
  console.log(chalk.cyan('│') + `  總花費: ${chalk.white(formatTime(stats.totalElapsed))}`.padEnd(50) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + `  預估節省: ${chalk.green(formatTime(stats.timeSaved))}`.padEnd(50) + chalk.cyan('│'));
  console.log(chalk.cyan('├' + '─'.repeat(48) + '┤'));
  if (stats.courseResults.length > 0) {
    stats.courseResults.forEach(cr => {
      console.log(chalk.cyan('│') + `  課程 ${cr.id}: ${chalk.green(cr.done + '✓')} ${chalk.yellow(cr.skip + '⊘')} ${chalk.red(cr.fail + '✗')}`.padEnd(50) + chalk.cyan('│'));
    });
    console.log(chalk.cyan('├' + '─'.repeat(48) + '┤'));
  }
  console.log(chalk.cyan('│') + `  完成時間: ${chalk.white(new Date().toLocaleString())}`.padEnd(52) + chalk.cyan('│'));
  console.log(chalk.cyan('└' + '─'.repeat(48) + '┘'));
  console.log('');
}

module.exports = { watchVideo, formatTime, printReport };
