"""
E2E: يتأكد أن حقل الخصم لم يعد موجودًا في شاشة إنشاء الفاتورة/عرض السعر،
وأنه يظهر فقط داخل CustomerPaymentDialog. كما يتحقق من ربط منطق
تحديث رصيد العميل (refetchAndToastCustomerBalance) بعد الحفظ.

Static-first: يفحص الملفات المصدرية ليكون الاختبار مستقرًا حتى بدون جلسة auth،
ثم يزور صفحات /invoices/new و /quotes/new للتأكد بصريًا أن الحقل غائب.
"""

import asyncio, os, json, re
from pathlib import Path
from playwright.async_api import async_playwright

SCREENSHOTS = Path(__file__).parent / "screenshots" / "discount-only-in-payment-dialog"
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


def assert_no_general_discount_chip(path: str):
    src = Path(path).read_text(encoding="utf-8")
    # يجب أن يكون SummaryChip الخاص بـ general-discount قد أُزيل نهائيًا
    assert 'id="general-discount"' not in src, (
        f"general-discount chip must be removed from {path}"
    )
    assert "general-discount" not in src, (
        f"general-discount references must be removed from {path}"
    )
    # ولا يجب أن يكون هناك DiscountInput مستورد في صفحات الإنشاء
    assert not re.search(r"^\s*import\s+.*DiscountInput", src, re.M), (
        f"DiscountInput import should not remain in {path}"
    )


def assert_payment_dialog_wires_balance():
    src = Path("src/components/invoice/CustomerPaymentDialog.tsx").read_text(encoding="utf-8")
    assert "DiscountInput" in src, "CustomerPaymentDialog must own the discount input"
    assert "refetchAndToastCustomerBalance" in src, (
        "CustomerPaymentDialog must trigger balance refresh + toast"
    )
    assert "logDiscountEvent" in src, "CustomerPaymentDialog must log discount audit"


async def main():
    # --- 1) فحص المصدر أولاً ---
    assert_no_general_discount_chip("src/pages/InvoiceCreatePage.tsx")
    assert_no_general_discount_chip("src/pages/QuoteCreatePage.tsx")
    assert_payment_dialog_wires_balance()
    print("source-level checks: OK")

    # --- 2) تحقق بصري في المتصفح (اختياري بحسب جلسة auth) ---
    auth_status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "no_supabase")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        if auth_status == "injected":
            await restore_session(page, context)
        else:
            await page.goto("http://localhost:8080", wait_until="domcontentloaded")

        for route, tag in [("/invoices/new", "invoice"), ("/quotes/new", "quote")]:
            await page.goto(f"http://localhost:8080{route}", wait_until="domcontentloaded")
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass
            await page.screenshot(path=str(SCREENSHOTS / f"1_{tag}_create.png"))

            # لا يجب أن يوجد chip بمعرّف general-discount
            chip = await page.locator('[data-chip-id="general-discount"]').count()
            assert chip == 0, f"general-discount chip visible on {route}"

            # ولا يجب أن يظهر مسمى "خصم عام" في شريط الأدوات
            general = await page.get_by_text("خصم عام", exact=False).count()
            assert general == 0, f"'خصم عام' still shown on {route}"
            print(f"{route}: no general discount UI ✓")

        await browser.close()
    print("OK")


asyncio.run(main())
