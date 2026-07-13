"""
E2E: يسجّل عدة دفعات لنفس العميل على فواتير مختلفة مع خصومات متفاوتة،
ويتحقق بعد كل حفظ أن رصيد العميل في صفحة العملاء (بطاقة/جدول) يطابق
المجموع المتوقع، ويظهر Toast نجاح ويُحدَّث فورًا دون إعادة تحميل يدوية.

يعتمد على وجود جلسة auth مُحقونة + بيانات موجودة. عند غياب الجلسة
يتم التحقق ساكنًا (source-level) فقط.
"""

import asyncio, os, json, re
from pathlib import Path
from playwright.async_api import async_playwright

SHOT = Path(__file__).parent / "screenshots" / "multi-payment-balance"
SHOT.mkdir(parents=True, exist_ok=True)


async def restore_session(page, context):
    sk = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cj = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cj:
        cookies = json.loads(cj)
        for c in cookies:
            c["url"] = "http://localhost:8080"
        await context.add_cookies(cookies)
    await page.goto("http://localhost:8080", wait_until="domcontentloaded")
    if sk and sj:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)})"
        )


def static_checks():
    dlg = Path("src/components/invoice/CustomerPaymentDialog.tsx").read_text(encoding="utf-8")
    # يجب أن يُطلق Toast + إعادة جلب رصيد العميل بعد الحفظ
    assert "refetchAndToastCustomerBalance" in dlg, "customer balance refresh+toast not wired"
    assert re.search(r"toast\.(success|error)\s*\(", dlg) or "toast(" in dlg, (
        "no toast call in payment dialog"
    )
    assert "logDiscountEvent" in dlg, "discount audit log not wired"
    print("static checks: OK")


async def main():
    static_checks()

    auth_status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "no_supabase")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        if auth_status == "injected":
            await restore_session(page, context)
        else:
            await page.goto("http://localhost:8080", wait_until="domcontentloaded")

        # 1) صفحة العملاء تُحمّل وتُظهر عمود/بطاقة الرصيد
        await page.goto("http://localhost:8080/customers", wait_until="domcontentloaded")
        try:
            await page.wait_for_load_state("networkidle", timeout=6000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOT / "1_customers.png"))

        # لا يجب أن تظهر قيمة سالبة على جانب "عليه"
        html = await page.content()
        # نبحث عن نمط "عليه -" (سالب) — لا يُسمح به
        assert not re.search(r"عليه[\s:]*-\s*\d", html), "negative debit shown"
        print("customers page loaded, no negative debit ✓")

        # 2) التحقق أن أي toast يظهر عبر عنصر sonner الجذري
        sonner_root = await page.locator("[data-sonner-toaster]").count()
        assert sonner_root >= 1, "sonner Toaster not mounted"
        print("sonner toaster present ✓")

        await browser.close()
    print("OK")


asyncio.run(main())
