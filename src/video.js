const chalk = require('chalk');

function log(msg) {
  console.log(msg);
}

async function watchVideo(page) {
  const hasVideo = await page.evaluate(() => document.querySelector('video') !== null);
  if (!hasVideo) {
    log(chalk.yellow('    [VIDEO] No video element'));
    return false;
  }

  log(chalk.blue('    [VIDEO] Muted + 2x speed'));

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
    log(chalk.yellow('    [VIDEO] Clicking play...'));
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
    log(chalk.yellow('    [VIDEO] Cannot get duration, waiting 30s...'));
    await page.waitForTimeout(30000);
    return true;
  }

  const waitTime = (duration / 2) + 15;
  log(chalk.blue(`    [VIDEO] ${Math.floor(duration)}s video, waiting ~${Math.floor(waitTime)}s (2x)`));

  let elapsed = 0;
  let lastPct = -1;
  let restartCount = 0;

  while (elapsed < waitTime) {
    await page.waitForTimeout(5000);
    elapsed += 5;

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
      log(chalk.blue(`    [VIDEO] ${state.p}% (${Math.floor(elapsed)}s)`));
      lastPct = state.p;
    }

    if (state.e) {
      log(chalk.green('    [VIDEO] 100% Finished'));
      break;
    }

    if (state.stalled) {
      if (elapsed % 15 === 0) {
        log(chalk.gray(`    [VIDEO] Buffering... (${Math.floor(elapsed)}s)`));
      }
      continue;
    }

    if (state.paused && elapsed > 5) {
      restartCount++;
      if (restartCount > 10) {
        log(chalk.red('    [VIDEO] Too many restarts, giving up'));
        return false;
      }
      log(chalk.yellow(`    [VIDEO] Paused, restarting (#${restartCount})...`));
      await page.evaluate(() => document.querySelector('video').play());
      await page.waitForTimeout(1000);
    }
  }

  await page.waitForTimeout(3000);
  return true;
}

module.exports = { watchVideo };
