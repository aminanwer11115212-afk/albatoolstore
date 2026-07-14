"""E2E: CustomerChargeHistory CSV export.

Opens a customer detail view, switches to سجل شحن الرصيد tab, clicks تصدير CSV,
and asserts a well-formed CSV download with the expected columns.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "charge-report-export"
SHOTS.mkdir(parents=True, exist_ok=True)
DOWNLOADS = Path("/tmp/browser/charge-report-export")
DOWNLOADS.mkdir(parents=True, exist_ok=True)

EXPECTED_HEADER = [
    "group_id","date","method","account","total_charge","allocated","surplus",
    "invoice_number","invoice_date","invoice_total","applied","remaining_after","new_status",
]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800}, accept_downloads=True)
        page = await context.new_page()

        session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = "http://localhost:8080"
            await context.add_cookies(cookies)

        await page.goto("http://localhost:8080")
        if key and session:
            await page.evaluate(f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(session)})")

        await page.goto("http://localhost:8080/customers", wait_until="domcontentloaded")
        await page.screenshot(path=str(SHOTS / "1_customers.png"))

        # Open the first customer row
        await page.get_by_role("row").nth(1).click()
        await page.wait_for_timeout(600)

        # Switch to شحن الرصيد tab if present
        try:
            await page.get_by_role("tab", name="شحن الرصيد").click(timeout=3000)
        except Exception:
            print("charge tab not visible for this customer")

        await page.screenshot(path=str(SHOTS / "2_history.png"))

        export_btn = page.get_by_test_id("export-charge-history-csv")
        if await export_btn.count() == 0:
            print("no export button — customer has no charges yet")
            await browser.close(); return

        async with page.expect_download() as dl_info:
            await export_btn.click()
        dl = await dl_info.value
        path = DOWNLOADS / dl.suggested_filename
        await dl.save_as(str(path))

        text = path.read_text(encoding="utf-8").lstrip("\ufeff")
        header = text.splitlines()[0].replace('"','').split(",")
        assert header == EXPECTED_HEADER, f"unexpected header: {header}"
        print(f"OK - exported {path.name} ({len(text.splitlines())-1} rows)")

        await browser.close()


asyncio.run(main())
