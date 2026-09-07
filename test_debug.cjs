const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const COOKIES_FILE = path.join(require('os').homedir(), '.eclass-auto', 'cookies.enc');
const SALT_FILE = path.join(require('os').homedir(), '.eclass-auto', 'salt.bin');
const crypto = require('crypto');

function loadCookies() {
  const key = crypto.pbkdf2Sync('eclass-local-key', fs.readFileSync(SALT_FILE), 480000, 32, 'sha256');
  const raw = fs.readFileSync(COOKIES_FILE);
  const iv = raw.subarray(0, 16);
  const enc = raw.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let dec = decipher.update(enc);
  dec = Buffer.concat([dec, decipher.final()]);
  return JSON.parse(dec.toString('utf-8'));
}

async function main() {
  const cookies = loadCookies();
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();

  console.log('1. Loading page...');
  await page.goto('https://eclass.yuntech.edu.tw/course/132854/learning-activity/full-screen#/861098', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(10000);

  console.log('2. All frames:');
  const frames = page.frames();
  console.log(`   Total frames: ${frames.length}`);
  for (const f of frames) {
    console.log(`   - ${f.url().substring(0, 100)}`);
  }

  console.log('3. Find YouTube frame...');
  const ytFrame = page.frame({ url: /youtube|youtu\.be/ });
  if (ytFrame) {
    console.log(`   Found: ${ytFrame.url().substring(0, 80)}`);

    console.log('4. Evaluate inside frame...');
    for (let i = 0; i < 15; i++) {
      const result = await ytFrame.evaluate(() => {
        const p = document.querySelector('#movie_player');
        return {
          hasPlayer: !!p,
          hasPlayVideo: p && typeof p.playVideo === 'function',
          bodyText: document.body ? document.body.textContent.substring(0, 100) : 'no body',
          scripts: document.querySelectorAll('script').length,
          readyState: document.readyState
        };
      }).catch(e => ({ error: e.message }));
      console.log(`   [${i}] ${JSON.stringify(result)}`);
      if (result.hasPlayVideo) break;
      await page.waitForTimeout(3000);
    }
  } else {
    console.log('   NOT FOUND! Trying alternative...');

    console.log('   Checking all frames for youtube...');
    for (const f of frames) {
      const url = f.url();
      if (url.includes('youtube') || url.includes('youtu.be')) {
        console.log(`   Found via iteration: ${url.substring(0, 80)}`);
        const result = await f.evaluate(() => {
          return {
            hasPlayer: !!document.querySelector('#movie_player'),
            bodyLen: document.body ? document.body.innerHTML.length : 0,
            readyState: document.readyState
          };
        }).catch(e => ({ error: e.message }));
        console.log(`   Content: ${JSON.stringify(result)}`);
      }
    }

    console.log('   Checking iframes in DOM...');
    const iframeInfo = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('iframe')).map(f => ({
        src: f.src.substring(0, 80),
        loaded: f.contentDocument !== null,
        w: f.offsetWidth, h: f.offsetHeight
      }));
    });
    console.log(`   DOM iframes: ${JSON.stringify(iframeInfo)}`);
  }

  await browser.close();
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
