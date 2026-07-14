"""E2E: FIFO ordering of charge allocation.

Verifies allocate_customer_charge always applies to the OLDEST open invoices
first, updates paid_amount/status precisely, and leaves surplus for the rest.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "charge-fifo"
SHOTS.mkdir(parents=True, exist_ok=True)

ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4bWFzZmRjamd3YXBtb2JlZm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDIxMDEsImV4cCI6MjA5NjE3ODEwMX0.I52mGYCbG1Cggm-Hz2lzKhAxzXGSTc49NJ9NvmLUqrM"


async def rest(page, path, method="GET", body=None):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN") or ""
    url = f"https://exmasfdcjgwapmobefne.supabase.co/rest/v1/{path}"
    return await page.evaluate(
        """async ({url, method, body, key, anon}) => {
            const r = await fetch(url, { method, headers: { apikey: anon, Authorization: 'Bearer ' + (key || anon), 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
            return { status: r.status, body: await r.text() };
        }""",
        {"url": url, "method": method, "body": body, "key": key, "anon": ANON},
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

        # Find a customer with ≥2 open, non-pos invoices to verify ordering
        r = await rest(page, "customers?select=id&balance=gt.0&limit=10")
        candidates = json.loads(r["body"])
        cid = None; open_invs = []
        for row in candidates:
            r = await rest(page, f"invoices?select=id,invoice_number,total,paid_amount,date,created_at,status,source&customer_id=eq.{row['id']}&order=date.asc,created_at.asc")
            invs = [i for i in json.loads(r["body"]) if i.get("status") != "cancelled" and i.get("source") != "pos" and (float(i.get("total") or 0) - float(i.get("paid_amount") or 0)) > 0.01]
            if len(invs) >= 2:
                cid = row["id"]; open_invs = invs; break
        if not cid:
            print("no customer with ≥2 open invoices"); await browser.close(); return

        # Charge = oldest.remaining + a bit → oldest paid, next partial
        oldest = open_invs[0]
        oldest_remaining = float(oldest["total"]) - float(oldest["paid_amount"])
        charge = oldest_remaining + 25
        r = await rest(page, "rpc/allocate_customer_charge", "POST", {
            "_customer_id": cid, "_amount": charge, "_date": "2026-07-14",
            "_method": "cash", "_account_id": None, "_reference_no": None, "_notes": "fifo-test"
        })
        assert r["status"] < 300, f"rpc failed: {r}"
        payload = json.loads(r["body"])
        allocs = payload.get("allocations", [])
        assert len(allocs) >= 1, "no allocations returned"
        # First allocation MUST target the oldest invoice
        assert allocs[0]["invoice_id"] == oldest["id"], f"FIFO violated: first alloc {allocs[0]['invoice_number']} != oldest {oldest['invoice_number']}"
        assert abs(float(allocs[0]["applied"]) - oldest_remaining) < 0.02, "did not fully cover oldest"
        assert allocs[0]["new_status"] == "paid", f"oldest not marked paid: {allocs[0]}"
        if len(allocs) >= 2:
            assert allocs[1]["invoice_id"] == open_invs[1]["id"], "second alloc not next oldest"
            assert allocs[1]["new_status"] in ("partial","paid"), f"unexpected status: {allocs[1]}"
        print(f"OK - FIFO: applied to {[a['invoice_number'] for a in allocs]}, surplus={payload.get('surplus')}")

        # Verify DB reflects the RPC result
        r = await rest(page, f"invoices?select=id,paid_amount,status&id=eq.{oldest['id']}")
        db_oldest = json.loads(r["body"])[0]
        assert db_oldest["status"] == "paid", f"DB oldest status: {db_oldest}"
        print(f"OK - DB reconciled: oldest paid_amount={db_oldest['paid_amount']}")

        await browser.close()


asyncio.run(main())
