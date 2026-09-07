const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function loadCookies() {
  const key = crypto.pbkdf2Sync('eclass-local-key', fs.readFileSync(path.join(require('os').homedir(), '.eclass-auto', 'salt.bin')), 480000, 32, 'sha256');
  const raw = fs.readFileSync(path.join(require('os').homedir(), '.eclass-auto', 'cookies.enc'));
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, raw.subarray(0, 16));
  let dec = decipher.update(raw.subarray(16));
  dec = Buffer.concat([dec, decipher.final()]);
  return JSON.parse(dec.toString('utf-8'));
}

async function test(headless) {
  console.log(`\n=== headless: ${headless} ===`);
  const cookies = loadCookies();
  const browser = await chromium.launch({ headless, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto('https://eclass.yuntech.edu.tw/course/132854/learning-activity/full-screen#/861098', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(15000);

  const ytFrame = page.frame({ url: /youtube|youtu\.be/ });
  console.log(`Frame found: ${!!ytFrame}`);

  if (ytFrame) {
    for (let i = 0; i < 10; i++) {
      try {
        const ready = await ytFrame.evaluate(() => {
          const p = document.querySelector('#movie_player');
          return !!(p && typeof p.playVideo === 'function');
        });
        console.log(`  [${i}] player ready: ${ready}`);
        if (ready) {
          await ytFrame.evaluate(() => document.querySelector('#movie_player').playVideo());
          await page.waitForTimeout(3000);
          const state = await ytFrame.evaluate(() => document.querySelector('#movie_player').getPlayerState());
          console.log(`  State: ${state}`);
          break;
        }
      } catch (e) {
        console.log(`  [${i}] Error: ${e.message.substring(0, 50)}`);
      }
      await page.waitForTimeout(2000);
    }
  }

  await browser.close();
}

(async () => {
  await test(false);
  await test(true);
})();
