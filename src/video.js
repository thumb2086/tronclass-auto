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

function progress(msg) {
  process.stdout.write('\r\x1b[K' + msg);
}

function log(msg) {
  console.log(msg);
}

async function detectPlayerType(page) {
  const type = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (v) return 'html5';
    const yt = document.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"]');
    if (yt) return 'youtube';
    for (const f of document.querySelectorAll('iframe')) {
      try { if (f.contentDocument && f.contentDocument.querySelector('video')) return 'html5'; } catch (e) {}
    }
    return 'none';
  });
  if (type !== 'none') return type;
  try {
    const ytFrame = page.frame({ url: /youtube|youtu\.be/ });
    if (ytFrame) return 'youtube';
  } catch (e) {}
  return 'none';
}

async function watchVideo(page, stats) {
  const playerType = await detectPlayerType(page);

  if (playerType === 'none') {
    log(chalk.yellow('  No player found'));
    return false;
  }

  if (playerType === 'youtube') {
    return await watchYouTube(page, stats);
  }

  return await watchHTML5(page, stats);
}

async function watchYouTube(page, stats) {
  log(chalk.blue('  YouTube embed'));
  let rate = 1;

  try {
    const ytFrame = page.frame({ url: /youtube|youtu\.be/ });

    if (!ytFrame) {
      log(chalk.yellow('  YouTube frame not found'));
      return false;
    }

    log(chalk.gray(`  Frame found: ${ytFrame.url().substring(0, 60)}`));

    let playerReady = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const ready = await ytFrame.evaluate(() => {
          const p = document.querySelector('#movie_player');
          return !!(p && typeof p.playVideo === 'function');
        });
        if (ready) { playerReady = true; break; }
      } catch (e) {}
      if (attempt % 3 === 0) log(chalk.gray(`  Waiting for player... (${attempt + 1}/15)`));
      await page.waitForTimeout(2000);
    }

    if (!playerReady) {
      log(chalk.yellow('  YouTube player not loaded'));
      return false;
    }

    log(chalk.blue('  Starting video...'));
    await ytFrame.evaluate(() => document.querySelector('#movie_player').playVideo());
    await page.waitForTimeout(5000);

    const state1 = await ytFrame.evaluate(() => document.querySelector('#movie_player').getPlayerState());
    if (state1 !== 1) {
      log(chalk.yellow(`  State: ${state1}, retrying...`));
      await ytFrame.evaluate(() => document.querySelector('#movie_player').playVideo());
      await page.waitForTimeout(5000);
    }

    await ytFrame.evaluate(() => {
      const p = document.querySelector('#movie_player');
      p.mute();
      p.setPlaybackRate(2);
    });
    await page.waitForTimeout(3000);

    rate = await ytFrame.evaluate(() => document.querySelector('#movie_player').getPlaybackRate());
    log(chalk.blue(`  Speed: ${rate}x`));

    const state2 = await ytFrame.evaluate(() => document.querySelector('#movie_player').getPlayerState());
    if (state2 === 1) {
      log(chalk.green('  Playing ✓'));
    } else {
      log(chalk.yellow(`  Final state: ${state2}`));
    }
  } catch (e) {
    log(chalk.yellow(`  YouTube error: ${e.message}`));
  }
      log(chalk.yellow(`  State: ${state2}`));
    }
  } catch (e) {
    log(chalk.yellow(`  YouTube error: ${e.message}`));
  }

  await page.waitForTimeout(2000);

  const ytDuration = await page.evaluate(() => {
    const actText = document.querySelector('.activity-attribute, [class*="attribute"]');
    if (actText) {
      const m = actText.textContent.match(/(\d{2}):(\d{2}):(\d{2})/);
      if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
    }
    return 180;
  });

  const waitTime = (rate >= 2 ? Math.ceil(ytDuration / 2) : ytDuration) + 30;
  log(chalk.blue(`  ~${formatTime(ytDuration)} video → ~${formatTime(waitTime)} (${rate}x)`));

  if (stats) {
    stats.currentVideoDuration = ytDuration;
    stats.currentVideoElapsed = 0;
  }

  let elapsed = 0;
  let lastPct = -1;

  while (elapsed < waitTime) {
    await page.waitForTimeout(5000);
    elapsed += 5;

    const pct = Math.min(100, Math.floor((elapsed / waitTime) * 100));
    if (pct > lastPct) {
      const barWidth = 20;
      const filled = Math.floor(barWidth * pct / 100);
      const empty = barWidth - filled;
      const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
      let etaStr = '';
      const remaining = Math.max(0, waitTime - elapsed);
      if (stats && stats.remainingVideos > 0) {
        etaStr = chalk.gray(` | ETA ${formatTime(remaining + stats.estimatedTimeForRemaining)}`);
      } else {
        etaStr = chalk.gray(` | ${formatTime(remaining)} left`);
      }
      progress(`${bar} ${String(pct).padStart(3)}%  (${formatTime(elapsed)})${etaStr}`);
      lastPct = pct;
    }
  }

  log(chalk.green('  Done ✓'));

  if (stats) stats.videosWatched++;
  return true;
}

async function watchHTML5(page, stats) {
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
      progress(`${bar} ${String(pct).padStart(3)}%  (${formatTime(elapsed)})${etaStr}`);
      lastPct = pct;
    }

    if (state.e) {
      log(chalk.green('  Done ✓'));
      break;
    }

    if (state.stalled) {
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
