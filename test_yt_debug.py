import asyncio
import sys
import os
sys.path.insert(0, r"C:\Users\CPXru\Desktop\thumb\大拇哥實驗室\eclass-auto")
from modules.auth import load_cookies
from playwright.async_api import async_playwright

async def main():
    cookies = load_cookies()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=50)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        await context.add_cookies(cookies)
        page = await context.new_page()

        url = "https://eclass.yuntech.edu.tw/course/132854/learning-activity/full-screen#/861098"
        print(f"Loading: {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(10)

        print("\n=== Step 1: Check iframe ===")
        yt_src = await page.evaluate("""() => {
            const f = document.querySelector('iframe[src*="youtube"]');
            return f ? f.src.substring(0, 100) : null;
        }""")
        print(f"YouTube iframe: {yt_src}")

        print("\n=== Step 2: Click iframe ===")
        yt_frame = page.locator('iframe[src*="youtube"]')
        await yt_frame.click()
        await asyncio.sleep(5)
        await page.screenshot(path="step2_after_click.png")
        print("Screenshot: step2_after_click.png")

        print("\n=== Step 3: Send listening ===")
        await page.evaluate("""() => {
            const f = document.querySelector('iframe[src*="youtube"]');
            if (f) f.contentWindow.postMessage('{"event":"listening"}', '*');
        }""")
        await asyncio.sleep(3)

        print("\n=== Step 4: Send playVideo ===")
        await page.evaluate("""() => {
            const f = document.querySelector('iframe[src*="youtube"]');
            if (f) f.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}), '*');
        }""")
        await asyncio.sleep(5)
        await page.screenshot(path="step4_after_play.png")
        print("Screenshot: step4_after_play.png")

        print("\n=== Step 5: Check currentTime ===")
        for i in range(3):
            ct = await page.evaluate("""() => {
                return new Promise((resolve) => {
                    const f = document.querySelector('iframe[src*="youtube"]');
                    if (!f) { resolve(-1); return; }
                    const handler = (e) => {
                        try {
                            const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                            if (d.event === 'infoDelivery' && d.info) {
                                window.removeEventListener('message', handler);
                                resolve(d.info.currentTime);
                            }
                        } catch(e) {}
                    };
                    window.addEventListener('message', handler);
                    f.contentWindow.postMessage(JSON.stringify({event:'command',func:'getCurrentTime',args:[]}), '*');
                    setTimeout(() => { window.removeEventListener('message', handler); resolve(-1); }, 5000);
                });
            }""")
            print(f"  Attempt {i+1}: currentTime = {ct}")
            if ct > 0:
                print("  Video IS playing!")
                break
            await asyncio.sleep(2)

        if ct <= 0:
            print("\n=== Step 6: Try clicking play button in iframe ===")
            try:
                frame = page.frame_locator('iframe[src*="youtube"]')
                play_btn = frame.locator('.ytp-large-play-button, .ytp-play-button, button[aria-label*="Play"]')
                count = await play_btn.count()
                print(f"  Play buttons found: {count}")
                if count > 0:
                    await play_btn.first.click()
                    print("  Clicked play button!")
                    await asyncio.sleep(5)
                    await page.screenshot(path="step6_after_play_btn.png")
            except Exception as e:
                print(f"  Error: {e}")

            ct2 = await page.evaluate("""() => {
                return new Promise((resolve) => {
                    const f = document.querySelector('iframe[src*="youtube"]');
                    if (!f) { resolve(-1); return; }
                    const handler = (e) => {
                        try {
                            const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                            if (d.event === 'infoDelivery' && d.info) {
                                window.removeEventListener('message', handler);
                                resolve(d.info.currentTime);
                            }
                        } catch(e) {}
                    };
                    window.addEventListener('message', handler);
                    f.contentWindow.postMessage(JSON.stringify({event:'command',func:'getCurrentTime',args:[]}), '*');
                    setTimeout(() => { window.removeEventListener('message', handler); resolve(-1); }, 5000);
                });
            }""")
            print(f"  After play button click: currentTime = {ct2}")

        await browser.close()
        print("\nDone!")

asyncio.run(main())
