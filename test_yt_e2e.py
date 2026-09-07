import asyncio
import sys
import os
sys.path.insert(0, r"C:\Users\CPXru\Desktop\thumb\大拇哥實驗室\eclass-auto")
from modules.auth import load_cookies
from playwright.async_api import async_playwright

URL = "https://eclass.yuntech.edu.tw/course/132854/learning-activity/full-screen#/861098"

async def postMsg(page, msg):
    s = msg if isinstance(msg, str) else __import__('json').dumps(msg)
    await page.evaluate("""(m) => {
        const f = document.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]');
        if (f) f.contentWindow.postMessage(m, '*');
    }""", s)

async def getYTInfo(page, command):
    return await page.evaluate("""(cmd) => {
        return new Promise((resolve) => {
            const f = document.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]');
            if (!f) { resolve(null); return; }
            let resolved = false;
            const handler = (e) => {
                try {
                    const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    if (d.event === 'infoDelivery' && d.info && !resolved) {
                        resolved = true;
                        window.removeEventListener('message', handler);
                        resolve(d.info);
                    }
                } catch(e) {}
            };
            window.addEventListener('message', handler);
            f.contentWindow.postMessage(JSON.stringify({event:'command', func:cmd, args:[]}), '*');
            setTimeout(() => { if (!resolved) { resolved = true; window.removeEventListener('message', handler); resolve(null); } }, 5000);
        });
    }""", command)

async def main():
    cookies = load_cookies()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=50)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        await context.add_cookies(cookies)
        page = await context.new_page()

        print(f"1. Loading {URL}")
        await page.goto(URL, wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(8)

        yt_src = await page.evaluate("() => { const f = document.querySelector('iframe[src*=\"youtube\"]'); return f ? f.src.substring(0,80) : null; }")
        print(f"2. YouTube iframe: {yt_src}")

        print("3. Scroll into view + click")
        await page.evaluate("() => { const f = document.querySelector('iframe[src*=\"youtube\"]'); if(f) f.scrollIntoView({block:'center'}); }")
        await asyncio.sleep(1)
        yt_frame = page.locator('iframe[src*="youtube"]')
        await yt_frame.click()
        await asyncio.sleep(5)
        await page.screenshot(path="test_01_after_click.png")

        print("4. Send listening")
        await postMsg(page, '{"event":"listening"}')
        await asyncio.sleep(3)

        print("5. Send mute")
        await postMsg(page, {"event":"command", "func":"mute", "args":[]})
        await asyncio.sleep(1)

        print("6. Send setPlaybackRate(2)")
        await postMsg(page, {"event":"command", "func":"setPlaybackRate", "args":[2]})
        await asyncio.sleep(3)

        print("7. Send playVideo")
        await postMsg(page, {"event":"command", "func":"playVideo", "args":[]})
        await asyncio.sleep(5)
        await page.screenshot(path="test_02_after_play.png")

        print("8. Check playbackRate")
        for i in range(3):
            info = await getYTInfo(page, "getPlaybackRate")
            if info:
                print(f"   attempt {i+1}: playbackRate = {info.get('playbackRate', '?')}")
                if info.get('playbackRate', 0) >= 2:
                    break
            else:
                print(f"   attempt {i+1}: no response")
            await asyncio.sleep(2)

        print("9. Check currentTime (should be > 0)")
        for i in range(3):
            info = await getYTInfo(page, "getCurrentTime")
            if info:
                ct = info.get('currentTime', 0)
                print(f"   attempt {i+1}: currentTime = {ct}")
                if ct > 0:
                    print("   VIDEO IS PLAYING!")
                    break
            else:
                print(f"   attempt {i+1}: no response")
            await asyncio.sleep(2)

        print("10. Check duration")
        info = await getYTInfo(page, "getDuration")
        dur = info.get('duration', 0) if info else 0
        print(f"    duration = {dur}s")

        print("11. Wait 30s, then check progress")
        await asyncio.sleep(30)
        info = await getYTInfo(page, "getCurrentTime")
        ct = info.get('currentTime', 0) if info else 0
        pct = (ct / dur * 100) if dur > 0 else 0
        print(f"    currentTime = {ct}s ({pct:.1f}%)")
        await page.screenshot(path="test_03_after_30s.png")

        print("12. Check player state")
        state = await page.evaluate("""() => {
            return new Promise((resolve) => {
                const f = document.querySelector('iframe[src*="youtube"]');
                if (!f) { resolve(null); return; }
                let resolved = false;
                const handler = (e) => {
                    try {
                        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                        if (d.event === 'infoDelivery' && d.info && !resolved) {
                            resolved = true;
                            window.removeEventListener('message', handler);
                            resolve({playerState: d.info.playerState, currentTime: d.info.currentTime, playbackRate: d.info.playbackRate});
                        }
                    } catch(e) {}
                };
                window.addEventListener('message', handler);
                f.contentWindow.postMessage(JSON.stringify({event:'command',func:'getPlayerState',args:[]}), '*');
                setTimeout(() => { if (!resolved) { resolved = true; window.removeEventListener('message', handler); resolve(null); } }, 5000);
            });
        }""")
        print(f"    playerState = {state}")

        print("\n=== DONE ===")
        await browser.close()

asyncio.run(main())
