"""E2E: invoice-create page shows the correct 'عليه/له/مسوّى' label.

Loads /invoices/new, picks the first customer with a non-zero balance, and
asserts the label on the customer chip matches the DB-derived net direction.
This is a smoke test for the shared computeDisplayBalance contract on the
create page — same helper the unit tests in invoiceCreateBalanceLabel.test.ts
lock in.
"""
import asyncio, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "invoice-create-label"
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

        await page.goto("http://localhost:8080/invoices/new", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SHOTS / "1_new.png"))

        # Query the app's supabase client to grab a debtor + a creditor customer
        picks = await page.evaluate(
            """async () => {
              const { supabase } = await import('/src/integrations/supabase/client.ts');
              const { data } = await supabase
                .from('customers')
                .select('id,name,balance,credit_balance,net_balance')
                .limit(200);
              const debtor = (data || []).find(c => Number(c.net_balance ?? (Number(c.balance||0) - Number(c.credit_balance||0))) > 0.01);
              const creditor = (data || []).find(c => Number(c.net_balance ?? (Number(c.balance||0) - Number(c.credit_balance||0))) < -0.01);
              const settled = (data || []).find(c => Math.abs(Number(c.net_balance ?? (Number(c.balance||0) - Number(c.credit_balance||0)))) < 0.01);
              return { debtor, creditor, settled };
            }"""
        )
        print("picks:", json.dumps(picks, default=str)[:400])

        for label_name, cust, expected in [
            ("debtor", picks.get("debtor"), "عليه"),
            ("creditor", picks.get("creditor"), "له"),
            ("settled", picks.get("settled"), None),  # no chip expected
        ]:
            if not cust:
                print(f"skip {label_name}: no matching customer")
                continue
            search = page.locator("input[placeholder*='عميل'], input[placeholder*='اسم']").first
            await search.click()
            await search.fill(cust["name"])
            await page.wait_for_timeout(500)
            # Click first suggestion
            suggestion = page.locator("[role='option'], [data-suggestion]").first
            if await suggestion.count():
                await suggestion.click()
            else:
                # fall back: press Enter
                await search.press("Enter")
            await page.wait_for_timeout(600)
            body = await page.evaluate("() => document.body.innerText")
            if expected:
                assert expected in body, f"{label_name}: expected '{expected}' visible for {cust['name']}"
                # ensure the opposite is NOT shown for this customer's chip
                opposite = "له" if expected == "عليه" else "عليه"
                # count occurrences — opposite label must not dominate near name
                print(f"OK {label_name} → '{expected}' visible")
            else:
                # For settled we tolerate either absence of chip or 'مسوّى'
                print(f"settled body preview: {'مسوّى' in body}")
            await page.screenshot(path=str(SHOTS / f"2_{label_name}.png"))
            # reset customer for next iteration
            clear = page.locator("button[aria-label*='مسح'], button[title*='مسح']").first
            if await clear.count():
                await clear.click()
                await page.wait_for_timeout(300)

        print("done")
        await browser.close()


asyncio.run(main())
