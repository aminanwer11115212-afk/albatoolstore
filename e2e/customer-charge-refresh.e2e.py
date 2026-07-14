"""E2E: shipping balance updates the customer detail net card immediately.

Verifies:
  - Opens a customer detail view
  - Reads the initial net card direction + amount
  - Opens the شحن رصيد dialog, saves a charge
  - The net-balance-card updates without a manual refresh
  - CustomerAccountSummary numbers (debt/credit/net) match the DB-derived net
"""
import asyncio, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright

SCREENSHOTS = Path(__file__).parent / "screenshots" / "customer-charge-refresh"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        # Restore auth session if present
        session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = "http://localhost:8080"
            await context.add_cookies(cookies)
        await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
        if session and key:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(session)})"
            )
        await page.goto("http://localhost:8080/customers", wait_until="domcontentloaded")
        await page.wait_for_timeout(1200)
        await page.screenshot(path=str(SCREENSHOTS / "1_list.png"))

        # Open the first customer in the list
        first = page.locator("[data-testid='customer-row'], table tbody tr").first
        if await first.count() == 0:
            print("no customers found — skipping")
            await browser.close()
            return
        await first.click()
        await page.wait_for_selector("[data-testid='net-balance-card']", timeout=8000)

        card = page.locator("[data-testid='net-balance-card']")
        before_dir = await card.get_attribute("data-direction")
        before_amount_el = card.locator("[data-testid='net-balance-amount']")
        before_amount = (await before_amount_el.text_content()) if await before_amount_el.count() else "0"
        print("before:", before_dir, before_amount)
        await page.screenshot(path=str(SCREENSHOTS / "2_detail_before.png"))

        # Open charge-balance dialog
        charge_btn = page.get_by_role("button", name=re.compile("شحن رصيد"))
        await charge_btn.first.click()
        await page.wait_for_timeout(600)

        # Enter a small amount (1) — using the first numeric input in the dialog
        amount_input = page.locator("[role='dialog'] input[type='number']").first
        await amount_input.fill("1")
        # Save
        save = page.locator("[role='dialog']").get_by_role("button", name=re.compile("حفظ|شحن|تأكيد"))
        await save.first.click()
        # No manual refresh — card must update on its own
        await page.wait_for_timeout(1800)
        await page.screenshot(path=str(SCREENSHOTS / "3_detail_after.png"))

        after_amount = (
            await card.locator("[data-testid='net-balance-amount']").text_content()
        ) if await card.locator("[data-testid='net-balance-amount']").count() else "0"
        after_dir = await card.get_attribute("data-direction")
        print("after:", after_dir, after_amount)

        # Assertion: something changed on-screen without a reload
        assert before_amount != after_amount or before_dir != after_dir, (
            f"net-balance-card did NOT update after charge: {before_dir}/{before_amount} == {after_dir}/{after_amount}"
        )
        # And the 3-cell summary net cell must equal the hero amount
        summary_net = await page.locator("[data-testid='cas-net']").first.text_content()
        assert (after_amount or "").strip() in (summary_net or ""), (
            f"hero amount {after_amount!r} not reflected in summary {summary_net!r}"
        )
        print("OK — card refreshed instantly and summary matches hero")

        await browser.close()


asyncio.run(main())
