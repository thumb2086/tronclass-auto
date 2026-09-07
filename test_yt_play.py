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

        print("2. Finding YouTube frame...")
        yt_frame = None
        for f in page.frames:
            if 'youtube' in f.url:
                yt_frame = f
                break

        if not yt_frame:
            print("   NO frame found!")
            await browser.close()
            return

        print("3. Check initial state...")
        state = await yt_frame.evaluate("""() => {
            const p = document.querySelector('#movie_player');
            return p ? {state: p.getPlayerState(), time: p.getCurrentTime()} : null;
        }""")
        print(f"   Initial: {state}")

        print("4. Call playVideo() via frame...")
        await yt_frame.evaluate("() => document.querySelector('#movie_player').playVideo()")
        await asyncio.sleep(5)

        state = await yt_frame.evaluate("""() => {
            const p = document.querySelector('#movie_player');
            return p ? {state: p.getPlayerState(), time: p.getCurrentTime(), rate: p.getPlaybackRate()} : null;
        }""")
        print(f"   After playVideo: {state}")

        if state and state['state'] != 1:
            print("   Still not playing, clicking player element...")
            try:
                await yt_frame.click('#movie_player')
            except:
                try:
                    await yt_frame.click('#video-container')
                except:
                    await yt_frame.click('body')
            await asyncio.sleep(5)
            state = await yt_frame.evaluate("""() => {
                const p = document.querySelector('#movie_player');
                return p ? {state: p.getPlayerState(), time: p.getCurrentTime()} : null;
            }""")
            print(f"   After click: {state}")

        if state and state['state'] != 1:
            print("   Still not playing, clicking on video element...")
            try:
                await yt_frame.click('video')
            except:
                pass
            await asyncio.sleep(5)
            state = await yt_frame.evaluate("""() => {
                const p = document.querySelector('#movie_player');
                return p ? {state: p.getPlayerState(), time: p.getCurrentTime()} : null;
            }""")
            print(f"   After video click: {state}")

        print("5. Mute + set 2x...")
        await yt_frame.evaluate("() => { document.querySelector('#movie_player').mute(); }")
        await asyncio.sleep(1)
        await yt_frame.evaluate("() => { document.querySelector('#movie_player').setPlaybackRate(2); }")
        await asyncio.sleep(2)
        rate = await yt_frame.evaluate("() => document.querySelector('#movie_player').getPlaybackRate()")
        print(f"   Rate: {rate}x")

        print("6. Wait 15s, check progress...")
        await asyncio.sleep(15)
        state = await yt_frame.evaluate("""() => {
            const p = document.querySelector('#movie_player');
            return p ? {
                state: p.getPlayerState(),
                time: p.getCurrentTime(),
                duration: p.getDuration(),
                rate: p.getPlaybackRate()
            } : null;
        }""")
        print(f"   After 15s: {state}")
        await page.screenshot(path="test_play_check.png")

        print("7. Wait 30 more seconds...")
        await asyncio.sleep(30)
        state = await yt_frame.evaluate("""() => {
            const p = document.querySelector('#movie_player');
            return p ? {
                state: p.getPlayerState(),
                time: p.getCurrentTime(),
                duration: p.getDuration(),
                rate: p.getPlaybackRate(),
                pct: Math.floor((p.getCurrentTime() / p.getDuration()) * 100)
            } : null;
        }""")
        print(f"   After 45s total: {state}")

        print("8. Go back and check server...")
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
        print(f"   Server: {result}")

        await browser.close()
        print("\n=== DONE ===")

asyncio.run(main())
