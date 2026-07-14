"""
E2E: التحقق من الوضع الأوفلاين + مؤشر المزامنة في الشريط العلوي.

الخطوات:
  1) فتح /customers مع اتصال (لتخزين الصفحة في الكاش عبر Service Worker/React Query).
  2) قطع الاتصال (context.set_offline(True)).
  3) التنقل بين /customers و /invoices والتأكد من عدم ظهور شاشة بيضاء
     وأن البيانات المخزنة تظهر، وأن شريط "غير متصل" ومؤشر المزامنة ظاهران.
  4) إعادة الاتصال (context.set_offline(False)) والتأكد من اختفاء شريط الأوفلاين.

يعتمد على جلسة Supabase المُدارة (LOVABLE_BROWSER_AUTH_STATUS=injected).
إن لم تكن الجلسة متاحة، يتم تخطي الاختبار بلطف.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "offline-mode"
SHOTS.mkdir(parents=True, exist_ok=True)

BASE = "http://localhost:8080"


async def restore_session(context, page):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    ses = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies:
        arr = json.loads(cookies)
        for c in arr:
            c["url"] = BASE
        await context.add_cookies(arr)
    await page.goto(BASE)
    if key and ses:
        await page.evaluate(f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(ses)})")


async def main():
    auth_status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS")
    if auth_status != "injected":
        print(f"SKIP: LOVABLE_BROWSER_AUTH_STATUS={auth_status!r} — لا توجد جلسة مُدارة، تخطي اختبار الأوفلاين.")
        return

    console_errors: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        await restore_session(ctx, page)

        # 1) تحميل أولي أونلاين لتعبئة الكاش
        await page.goto(f"{BASE}/customers", wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "1_customers_online.png"))

        # 2) قطع الاتصال
        await ctx.set_offline(True)
        await page.wait_for_timeout(500)

        # التنقل بين الصفحتين أثناء الأوفلاين — عبر SPA client-side routing
        # (goto كامل يفشل بـ ERR_INTERNET_DISCONNECTED لأن هذا SPA بدون service worker
        #  لتخزين مسارات كاملة؛ التنقل الحقيقي أثناء الاستخدام يتم عبر React Router).
        try:
            await page.evaluate("window.history.pushState({}, '', '/invoices')")
            await page.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))")
        except Exception as e:
            print("navigate to /invoices via history failed:", e)
        await page.wait_for_timeout(2000)
        body_text_invoices = await page.inner_text("body")
        is_blank_invoices = len(body_text_invoices.strip()) < 20
        print(f"invoices offline blank-screen? {is_blank_invoices}")
        await page.screenshot(path=str(SHOTS / "2_invoices_offline.png"))

        try:
            await page.evaluate("window.history.pushState({}, '', '/customers')")
            await page.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))")
        except Exception as e:
            print("navigate to /customers via history failed:", e)
        await page.wait_for_timeout(2000)
        body_text_customers = await page.inner_text("body")
        is_blank_customers = len(body_text_customers.strip()) < 20
        print(f"customers offline blank-screen? {is_blank_customers}")

        # التحقق من شريط الأوفلاين ومؤشر المزامنة
        try:
            offline_banner = page.get_by_text("غير متصل", exact=False)
            await offline_banner.first.wait_for(timeout=3000)
            print("OK: عثر على شريط/نص 'غير متصل'")
        except Exception as e:
            print("MISSING offline indicator text:", e)

        sync_indicator = page.locator('[data-testid="sync-status-indicator"]')
        try:
            await sync_indicator.first.wait_for(timeout=3000)
            is_online_attr = await sync_indicator.first.get_attribute("data-online")
            print(f"sync-status-indicator data-online={is_online_attr}")
        except Exception as e:
            print("MISSING sync-status-indicator:", e)

        await page.screenshot(path=str(SHOTS / "3_offline_banner_and_sync.png"))

        # 3) إعادة الاتصال
        await ctx.set_offline(False)
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(SHOTS / "4_back_online.png"))

        try:
            await offline_banner.first.wait_for(state="hidden", timeout=5000)
            print("OK: اختفى شريط 'غير متصل' بعد عودة الاتصال")
        except Exception as e:
            print("offline banner may still be visible / not detected as hidden:", e)

        print("FINAL URL:", page.url)
        print("CONSOLE ERRORS:", console_errors if console_errors else "لا توجد")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
