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

        await page.goto("https://eclass.yuntech.edu.tw/course/132854/content#/", wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(5)

        result = await page.evaluate("""() => {
            const el = document.querySelector('.learning-activities');
            if (!el) return {error: 'no scope'};
            const scope = angular.element(el).scope();
            if (!scope) return {error: 'no scope'};

            const activities = document.querySelectorAll('.learning-activity.sortable');
            let items = [];
            for (const actEl of activities) {
                const actScope = angular.element(actEl).scope();
                if (!actScope || !actScope.activity) continue;
                const a = actScope.activity;
                if (a.type !== 'online_video') continue;

                let completeness = '';
                try { completeness = scope.getActivityCompleteness(a); } catch(e) { completeness = 'error: ' + e.message; }

                let isUpcoming = false;
                try { isUpcoming = scope.activityUpcoming(a); } catch(e) {}

                items.push({
                    id: a.id,
                    title: (a.title || '').substring(0, 40),
                    completeness: completeness,
                    isUpcoming: isUpcoming,
                    readType: a.readType || '',
                    teaching_model: a.teaching_model || '',
                    criterion: a.criterion || '',
                    criterionKey: a.completion_criterion_key || ''
                });
            }
            return items;
        }""")

        for item in result:
            print(f"[{item['completeness']:>6}] {item['title']}")
            print(f"         id={item['id']} model={item['teaching_model']} criterion={item['criterion']} key={item['criterionKey']}")

        await browser.close()

asyncio.run(main())
