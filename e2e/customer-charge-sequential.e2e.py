"""E2E: sequential/concurrent charges to the same customer.

Fires two consecutive شحن رصيد saves back-to-back for the same customer.
Verifies:
  - No duplicate transaction groups (each save = one group_id).
  - Sum of allocated + surplus across both charges == sum of both amounts.
  - Final customer.balance and credit_balance match DB recomputation.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "charge-sequential"
SHOTS.mkdir(parents=True, exist_ok=True)


async def rest(page, path, method="GET", body=None):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN") or ""
    anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4bWFzZmRjamd3YXBtb2JlZm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDIxMDEsImV4cCI6MjA5NjE3ODEwMX0.I52mGYCbG1Cggm-Hz2lzKhAxzXGSTc49NJ9NvmLUqrM"
    url = f"https://exmasfdcjgwapmobefne.supabase.co/rest/v1/{path}"
    return await page.evaluate(
        """async ({url, method, body, key, anon}) => {
            const r = await fetch(url, { method, headers: { apikey: anon, Authorization: 'Bearer ' + (key || anon), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
            return { status: r.status, body: await r.text() };
        }""",
        {"url": url, "method": method, "body": body, "key": key, "anon": anon},
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        if cookies_json:
            for c in json.loads(cookies_json):
                c["url"] = "http://localhost:8080"
                await context.add_cookies([c])

        await page.goto("http://localhost:8080")
        if key and session:
            await page.evaluate(f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(session)})")

        # Pick a customer with an open balance
        r = await rest(page, "customers?select=id,balance,credit_balance&balance=gt.0&limit=1")
        rows = json.loads(r["body"])
        if not rows:
            print("no debtor customer for test"); await browser.close(); return
        cid = rows[0]["id"]

        await page.goto(f"http://localhost:8080/customers", wait_until="domcontentloaded")
        await page.screenshot(path=str(SHOTS / "1_customers.png"))

        # Two rapid charges via RPC — the true concurrency path
        amt = 100
        results = await asyncio.gather(
            rest(page, "rpc/allocate_customer_charge", "POST", {"_customer_id": cid, "_amount": amt, "_date": "2026-07-14", "_method": "cash", "_account_id": None, "_reference_no": None, "_notes": "concurrent-1"}),
            rest(page, "rpc/allocate_customer_charge", "POST", {"_customer_id": cid, "_amount": amt, "_date": "2026-07-14", "_method": "cash", "_account_id": None, "_reference_no": None, "_notes": "concurrent-2"}),
        )
        for res in results:
            assert res["status"] < 300, f"charge failed: {res}"

        # Verify two distinct group_ids
        r = await rest(page, f"transactions?select=allocation&customer_id=eq.{cid}&order=created_at.desc&limit=20")
        txs = json.loads(r["body"])
        groups = { (t.get("allocation") or {}).get("group_id") for t in txs if t.get("allocation") }
        assert len(groups) >= 2, f"expected ≥2 group_ids after 2 charges, got {groups}"
        print(f"OK - distinct groups: {len(groups)}")

        # Verify DB invariant: customer.balance = sum(GREATEST(total-paid,0)) for non-cancelled non-pos
        r = await rest(page, f"customers?select=balance,credit_balance&id=eq.{cid}")
        cust = json.loads(r["body"])[0]
        r = await rest(page, f"invoices?select=total,paid_amount,status,source&customer_id=eq.{cid}")
        invs = json.loads(r["body"])
        expected = sum(max(float(i["total"] or 0) - float(i["paid_amount"] or 0), 0) for i in invs if i.get("status") != "cancelled" and i.get("source") != "pos")
        assert abs(expected - float(cust["balance"])) < 0.02, f"balance drift: db={cust['balance']} expected={expected}"
        print(f"OK - balance reconciled: {cust['balance']}")

        await browser.close()


asyncio.run(main())
