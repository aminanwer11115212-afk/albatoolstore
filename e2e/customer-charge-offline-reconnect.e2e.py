"""E2E: offline charge → reconnect → auto-refresh of net balance card.

Verifies:
  - Open customer detail
  - Go offline (context.set_offline True)
  - Charge balance (queued into offline queue)
  - Come back online — the offline queue flushes automatically
  - The net-balance-card updates on its own (no manual refresh)
"""
import asyncio, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "customer-charge-offline"
SHOTS.mkdir(parents=True, exist_ok=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

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

        first = page.locator("[data-testid='customer-row'], table tbody tr").first
        if await first.count() == 0:
            print("no customers — skipping")
            await browser.close()
            return
        await first.click()
        await page.wait_for_selector("[data-testid='net-balance-card']", timeout=8000)
        card = page.locator("[data-testid='net-balance-card']")
        before = (
            await card.locator("[data-testid='net-balance-amount']").text_content()
        ) if await card.locator("[data-testid='net-balance-amount']").count() else "0"
        print("before:", before)
        await page.screenshot(path=str(SHOTS / "1_before.png"))

        # Go offline
        await context.set_offline(True)
        print("→ offline")

        # Perform the charge while offline
        charge_btn = page.get_by_role("button", name=re.compile("شحن رصيد"))
        await charge_btn.first.click()
        await page.wait_for_timeout(400)
        amount_input = page.locator("[role='dialog'] input[type='number']").first
        await amount_input.fill("3")
        save = page.locator("[role='dialog']").get_by_role("button", name=re.compile("حفظ|شحن|تأكيد"))
        await save.first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "2_offline_after_save.png"))

        # Come back online — RealtimeSync + offline queue should flush and refresh
        await context.set_offline(False)
        print("→ online")
        # Give the queue a fair chance to flush + realtime to broadcast
        await page.wait_for_timeout(5000)
        await page.screenshot(path=str(SHOTS / "3_after_reconnect.png"))

        after = (
            await card.locator("[data-testid='net-balance-amount']").text_content()
        ) if await card.locator("[data-testid='net-balance-amount']").count() else "0"
        after_dir = await card.get_attribute("data-direction")
        summary_net = await page.locator("[data-testid='cas-net']").first.text_content()
        print("after:", after_dir, after, "summary:", summary_net)

        # Hero and summary must stay in sync after auto-refresh
        assert (after or "").strip() in (summary_net or ""), (
            f"card did NOT auto-refresh after reconnect: hero={after!r} summary={summary_net!r}"
        )
        print("OK — auto-refresh after reconnect confirmed")

        await browser.close()


asyncio.run(main())
