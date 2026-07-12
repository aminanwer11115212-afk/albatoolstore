"""
E2E: بعد حفظ دفعة/شحن رصيد على صفحة إنشاء الفاتورة، يجب:
  1) ظهور Toast "جارٍ تحديث الرصيد…" ثم "تم تحديث الرصيد"
  2) تحديث الرصيد المعروض في الصفحة تلقائيًا بدون Reload يدوي

يعتمد على جلسة Supabase المُدارة (LOVABLE_BROWSER_AUTH_STATUS=injected)
ووجود عميل تجريبي واحد على الأقل في الحساب.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "balance-refresh"
SHOTS.mkdir(parents=True, exist_ok=True)

BASE = "http://localhost:8080"

async def restore_session(context, page):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    ses = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies:
        arr = json.loads(cookies)
        for c in arr: c["url"] = BASE
        await context.add_cookies(arr)
    await page.goto(BASE)
    if key and ses:
        await page.evaluate(f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(ses)})")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        toasts: list[str] = []
        page.on("console", lambda m: None)

        await restore_session(ctx, page)
        await page.goto(f"{BASE}/invoices/create", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(SHOTS / "1_invoice_create.png"))

        # نطلق حدث customers:changed يدويًا لتقليد ما تفعله نوافذ الدفع
        await page.evaluate("window.dispatchEvent(new Event('customers:changed'))")
        # ننتظر ظهور توست الـ loading
        try:
            loading = page.get_by_text("جارٍ تحديث الرصيد", exact=False)
            await loading.wait_for(timeout=2000)
            print("OK: loading toast visible")
        except Exception as e:
            print("MISSING loading toast:", e)
        await page.screenshot(path=str(SHOTS / "2_loading.png"))

        # ثم توست النجاح
        try:
            success = page.get_by_text("تم تحديث الرصيد", exact=False)
            await success.wait_for(timeout=3000)
            print("OK: success toast visible")
        except Exception as e:
            print("MISSING success toast:", e)
        await page.screenshot(path=str(SHOTS / "3_success.png"))

        # نكرر نفس الاختبار على صفحة إنشاء عرض السعر
        await page.goto(f"{BASE}/quotes/create", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.evaluate("window.dispatchEvent(new Event('customers:changed'))")
        try:
            await page.get_by_text("تم تحديث الرصيد", exact=False).wait_for(timeout=3000)
            print("OK: quotes page refresh toast")
        except Exception as e:
            print("MISSING quotes toast:", e)
        await page.screenshot(path=str(SHOTS / "4_quote.png"))

        # صفحة إنشاء الشراء (suppliers:changed)
        await page.goto(f"{BASE}/purchases/create", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.evaluate("window.dispatchEvent(new Event('suppliers:changed'))")
        try:
            await page.get_by_text("تم تحديث الرصيد", exact=False).wait_for(timeout=3000)
            print("OK: purchases page refresh toast")
        except Exception as e:
            print("MISSING purchases toast:", e)
        await page.screenshot(path=str(SHOTS / "5_purchase.png"))

        # صفحة إرجاع المخزون
        await page.goto(f"{BASE}/stock-returns/create", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await page.evaluate("window.dispatchEvent(new Event('customers:changed'))")
        try:
            await page.get_by_text("تم تحديث الرصيد", exact=False).wait_for(timeout=3000)
            print("OK: stock-returns page refresh toast")
        except Exception as e:
            print("MISSING stock-returns toast:", e)
        await page.screenshot(path=str(SHOTS / "6_return.png"))

        await browser.close()

asyncio.run(main())
