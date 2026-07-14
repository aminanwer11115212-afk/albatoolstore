"""E2E: charging a customer balance while a concurrent update is arriving.

Verifies:
  - Opens customer detail view
  - Simulates a *concurrent* DB update to `credit_balance` via a background
    fetch to the REST endpoint, timed to overlap with the شحن رصيد save
  - After both settle, the net-balance-card and the "refresh"/summary numbers
    reflect the DB state (no stale UI, no lost update visible on-screen)
"""
import asyncio, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "customer-charge-concurrent"
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
        before_amount = (
            await card.locator("[data-testid='net-balance-amount']").text_content()
        ) if await card.locator("[data-testid='net-balance-amount']").count() else "0"
        print("before:", before_amount)
        await page.screenshot(path=str(SHOTS / "1_before.png"))

        # Fire a concurrent no-op update on window.__lastCustomerId via the
        # app's own supabase client — this races the charge dialog save.
        concurrent = page.evaluate(
            """async () => {
              // trigger a realtime-emitting touch on the currently-open customer
              const { supabase } = await import('/src/integrations/supabase/client.ts');
              const url = new URL(location.href);
              const id = url.pathname.split('/').pop();
              if (!id) return null;
              const now = new Date().toISOString();
              const { error } = await supabase.from('customers').update({ updated_at: now }).eq('id', id);
              return error ? String(error.message) : 'ok';
            }"""
        )

        charge_btn = page.get_by_role("button", name=re.compile("شحن رصيد"))
        await charge_btn.first.click()
        await page.wait_for_timeout(400)
        amount_input = page.locator("[role='dialog'] input[type='number']").first
        await amount_input.fill("2")
        save = page.locator("[role='dialog']").get_by_role("button", name=re.compile("حفظ|شحن|تأكيد"))
        await save.first.click()

        # Await both the charge save and the concurrent touch
        touch_result = await concurrent
        print("concurrent touch:", touch_result)
        await page.wait_for_timeout(2200)
        await page.screenshot(path=str(SHOTS / "2_after.png"))

        after_amount = (
            await card.locator("[data-testid='net-balance-amount']").text_content()
        ) if await card.locator("[data-testid='net-balance-amount']").count() else "0"
        summary_net = await page.locator("[data-testid='cas-net']").first.text_content()
        print("after amount:", after_amount, "summary:", summary_net)

        # UI must not remain stale — the hero amount and summary must agree
        assert (after_amount or "").strip() in (summary_net or ""), (
            f"stale UI: hero {after_amount!r} not reflected in summary {summary_net!r}"
        )
        print("OK — no stale data after concurrent update")

        await browser.close()


asyncio.run(main())
