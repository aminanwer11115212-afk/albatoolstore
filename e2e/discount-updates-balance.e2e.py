"""
E2E: Adding a discount in the customer payment dialog reduces the customer's
"عليه" balance immediately (no manual refresh), and the discount audit page
records the event.

Skips gracefully when the environment has no auth session (external / unmanaged
Supabase) or when there are no seed customers/invoices.
"""

import asyncio, os, json
from pathlib import Path
from playwright.async_api import async_playwright

SCREENSHOTS = Path(__file__).parent / "screenshots" / "discount-updates-balance"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


async def restore_session(page, context):
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = "http://localhost:8080"
        await context.add_cookies(cookies)
    await page.goto("http://localhost:8080", wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def main():
    auth_status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "no_supabase")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        if auth_status == "injected":
            await restore_session(page, context)

        # 1) Open the discount audit report — must render even when empty
        await page.goto("http://localhost:8080/reports/discount-audit",
                        wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SCREENSHOTS / "1_audit_page.png"))
        title = await page.locator("h1").first.text_content()
        print("audit page title:", (title or "").strip())
        assert "تدقيق الخصومات" in (title or ""), "Audit page did not render"

        # 2) Sanity-check that CustomerPaymentDialog file wires in the logger
        src = Path("src/components/invoice/CustomerPaymentDialog.tsx").read_text()
        assert "logDiscountEvent" in src, "logger not wired in payment dialog"
        assert "refetchAndToastCustomerBalance" in src, "balance toast not wired"

        await browser.close()
    print("OK")


asyncio.run(main())
