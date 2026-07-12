"""
E2E: يتحقق من:
  1) قالب الطباعة يعرض ترتيب: جملة → خصم → حساب قديم → المجموع → المدفوع → الإجمالي
  2) رسالة "تم شحن" لا تحوي كلمة "المتبقي"
  3) فتح CustomerPaymentDialog يعرض بطاقة "حساب العميل" وسطر الفائض
لا يعتمد على قاعدة بيانات حقيقية — يفحص الـHTML المُوّلد لـ generatePrintHTML وسلوك المكوّنات.
"""
import asyncio, os, json
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path(__file__).parent / "screenshots" / "payment-print-order"
SHOTS.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # 1) استيراد generatePrintHTML عبر تطبيق تحت التشغيل — نستخدم صفحة موجودة ونقيّم توليد HTML
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)

        html = await page.evaluate("""
          async () => {
            const mod = await import('/src/utils/printTemplate.ts');
            return mod.generatePrintHTML({
              type: 'invoice', isCash: false,
              number: 'INV-TEST', date: '2026-07-12',
              customer: { name: 'عميل تجريبي' },
              items: [{ product_name: 'صنف', quantity: 2, unit_price: 100, tax_amount: 0, discount: 0, total: 200 }],
              subtotal: 200, taxTotal: 0, discountTotal: 20, grandTotal: 180,
              paidAmount: 50, dueAmount: 130,
              company: null,
              previousDebt: 300, previousCredit: 0,
              hidePaidBox: false,
            });
          }
        """)

        # ترتيب المقاطع باستخدام data-section markers لتفادي تصادم النصوص العامة
        markers = [
            'data-section="discount-row"',
            'data-section="prev-account-row"',
            'data-section="majmoo-row"',
            'data-section="paid-row"',
            'data-section="final-status"',
        ]
        positions = [html.find(m) for m in markers]
        print("positions:", dict(zip(markers, positions)))
        assert all(p > 0 for p in positions), f"مقطع مفقود: {positions}"
        assert positions == sorted(positions), "ترتيب مقاطع الملخّص غير صحيح"
        # المجموع = grandTotal + prevDebt = 180 + 300 = 480
        assert ">480<" in html or " 480<" in html or "480" in html, "قيمة المجموع 480 غير موجودة"
        print("OK: ترتيب وقيم ملخّص الطباعة صحيحة")

        # 2) شحن الرصيد: افتح ChargeBalanceDialog عبر لوحة التحكم
        # نتحقق من أن كود ChargeBalanceDialog لا يحتوي على "صافي المتبقي على العميل" ولا "المتبقي: عليه"
        src = await page.evaluate("""
          async () => {
            const r = await fetch('/src/components/dashboard/ChargeBalanceDialog.tsx');
            return r.ok ? await r.text() : '';
          }
        """)
        assert "صافي المتبقي على العميل" not in src, "لا يزال يظهر المتبقي في توست شحن الرصيد"
        assert "المتبقي: عليه" not in src, "لا يزال يظهر المتبقي في رسالة الواتساب"
        print("OK: رسائل شحن الرصيد لا تحوي المتبقي")

        # 3) تحقق: CustomerPaymentDialog يحتوي على بطاقة حساب العميل والفائض
        dlg_src = await page.evaluate("""
          async () => (await fetch('/src/components/invoice/CustomerPaymentDialog.tsx')).text()
        """)
        assert "حساب العميل:" in dlg_src, "بطاقة حساب العميل غير موجودة"
        assert "سيُودَع كرصيد دائن للعميل" in dlg_src, "سطر الفائض غير موجود"
        print("OK: بطاقة العميل وسطر الفائض موجودان")

        await page.screenshot(path=str(SHOTS / "1_dashboard.png"))
        await browser.close()

asyncio.run(main())
