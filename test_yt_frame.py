import asyncio
import sys
import os
sys.path.insert(0, r"C:\Users\CPXru\Desktop\thumb\大拇哥實驗室\eclass-auto")
from modules.auth import load_cookies
from playwright.async_api import async_playwright

URL = "https://eclass.yuntech.edu.tw/course/132854/learning-activity/full-screen#/861098"

async def main():
    cookies = load_cookies()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=50)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        await context.add_cookies(cookies)
        page = await context.new_page()

        print("1. Loading page...")
        await page.goto(URL, wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(8)

        print("2. Finding YouTube frame via page.frame()...")
        yt_frame = None
        for f in page.frames:
            if 'youtube' in f.url:
                yt_frame = f
                print(f"   Found: {f.url[:80]}")
                break

        if not yt_frame:
            print("   NO YouTube frame found!")
            await browser.close()
            return

        print("3. Clicking play button inside iframe...")
        try:
            play_btn = yt_frame.locator('.ytp-large-play-button')
            await play_btn.click(timeout=5000)
            print("   Clicked .ytp-large-play-button")
        except:
            try:
                play_btn = yt_frame.locator('.ytp-play-button')
                await play_btn.click(timeout=5000)
                print("   Clicked .ytp-play-button")
            except:
                print("   No play button found, trying area click")
                try:
                    await yt_frame.locator('#movie_player').click(timeout=3000)
                    print("   Clicked #movie_player")
                except:
                    print("   FAILED to click anything")

        await asyncio.sleep(5)
        await page.screenshot(path="test_frame_play.png")

        print("4. Check YouTube player state via frame...")
        try:
            state = await yt_frame.evaluate("""() => {
                const player = document.querySelector('#movie_player');
                if (player && player.getPlayerState) {
                    return {
                        state: player.getPlayerState(),
                        currentTime: player.getCurrentTime(),
                        duration: player.getDuration(),
                        playbackRate: player.getPlaybackRate()
                    };
                }
                return null;
            }""")
            print(f"   State: {state}")
        except Exception as e:
            print(f"   Error: {e}")

        print("5. Set speed to 2x via frame...")
        try:
            await yt_frame.evaluate("() => { document.querySelector('#movie_player').setPlaybackRate(2); }")
            await asyncio.sleep(2)
            rate = await yt_frame.evaluate("() => document.querySelector('#movie_player').getPlaybackRate()")
            print(f"   Speed set to: {rate}x")
        except Exception as e:
            print(f"   Error: {e}")

        print("6. Wait 30s then check...")
        await asyncio.sleep(30)
        try:
            state2 = await yt_frame.evaluate("""() => {
                const player = document.querySelector('#movie_player');
                if (player && player.getPlayerState) {
                    return {
                        state: player.getPlayerState(),
                        currentTime: player.getCurrentTime(),
                        duration: player.getDuration(),
                        playbackRate: player.getPlaybackRate()
                    };
                }
                return null;
            }""")
            print(f"   State after 30s: {state2}")
        except Exception as e:
            print(f"   Error: {e}")

        await page.screenshot(path="test_frame_30s.png")

        print("7. Navigate to content page and check completeness...")
        await page.goto("https://eclass.yuntech.edu.tw/course/132854/content#/", wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(5)

        result = await page.evaluate("""() => {
            const el = document.querySelector('.learning-activities');
            if (!el) return {error: 'no scope'};
            const scope = angular.element(el).scope();
            if (!scope) return {error: 'no scope'};
            const activities = document.querySelectorAll('.learning-activity.sortable');
            for (const actEl of activities) {
                const actScope = angular.element(actEl).scope();
                if (!actScope || !actScope.activity) continue;
                if (actScope.activity.id == 861098) {
                    return {completeness: scope.getActivityCompleteness(actScope.activity)};
                }
            }
            return {error: 'not found'};
        }""")
        print(f"   SDG13 completeness: {result}")

        await browser.close()
        print("\n=== DONE ===")

asyncio.run(main())
