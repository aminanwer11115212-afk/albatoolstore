import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(exist_ok=True)

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies: c["url"] = "http://localhost:8080"
            await ctx.add_cookies(cookies)
        await page.goto("http://localhost:8080", wait_until="domcontentloaded")
        if storage_key and session_json:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
            )

        results = {}
        for slug, url in [
            ("customers", "/customers"),
            ("debt_report", "/customers/debt-report"),
            ("statement", "/reports/customer-statement"),
        ]:
            await page.goto("http://localhost:8080" + url, wait_until="networkidle")
            await page.wait_for_timeout(1500)
            await page.screenshot(path=str(SHOTS / f"{slug}.png"))
            title = await page.title()
            body = await page.evaluate("() => document.body.innerText.slice(0, 500)")
            results[slug] = {"url": page.url, "title": title, "body_preview": body[:250]}
            print(f"\n[{slug}] {page.url}")
            print("  title:", title)

        # Read net total from debt report card
        await page.goto("http://localhost:8080/customers/debt-report", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        net_total = await page.evaluate("""
          () => {
            const txt = document.body.innerText;
            const m = txt.match(/إجمالي الصافي المستحق[:\\s]*([0-9,.-]+)/);
            return m ? m[1] : null;
          }
        """)
        print("\nإجمالي الصافي المستحق (debt-report card):", net_total)
        print("\nconsole errors:", len(errors))
        for e in errors[:8]:
            print("  -", e[:180])

        await browser.close()
asyncio.run(main())
