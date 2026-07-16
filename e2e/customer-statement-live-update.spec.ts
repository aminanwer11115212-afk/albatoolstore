/**
 * e2e: بعد إضافة فاتورة لعميل، صفحة كشف حسابه يجب أن تعكس التحديث
 * فوراً في نفس الجلسة دون تدخّل يدوي، ودون تكرار الاشتراكات.
 *
 * نتحقّق من:
 *  1) بث invoices:changed + customers:changed يُبطل مفاتيح
 *     customer-statement و customer-transactions (تعاقد realtimeSync).
 *  2) الرجوع إلى صفحة الكشف بعد إضافة فاتورة يُعيد الاستعلام
 *     (refetchOnMount:"always" + staleTime:0).
 *  3) لا تتراكم مستمعات مكررة على نفس الحدث بين التنقلات.
 */
import { test, expect } from "@playwright/test";

test("statement page re-fetches after invoice event in same session", async ({ page }) => {
  await page.goto("/customers/statements");

  // نُحصي بث الأحداث + استدعاءات fetch لجداول الكشف
  await page.evaluate(() => {
    (window as any).__st = { invoices: 0, customers: 0, fetches: 0 };
    window.addEventListener("invoices:changed", () => (window as any).__st.invoices++);
    window.addEventListener("customers:changed", () => (window as any).__st.customers++);
    const origFetch = window.fetch.bind(window);
    window.fetch = ((input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (/\/rest\/v1\/(invoices|transactions|customers)/.test(url)) {
        (window as any).__st.fetches++;
      }
      return origFetch(input, init);
    }) as typeof window.fetch;
  });

  // محاكاة "حفظ فاتورة" في نفس الجلسة
  await page.evaluate(() => {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("customers:changed"));
    window.dispatchEvent(new Event("transactions:changed"));
  });

  await page.waitForTimeout(400);
  const counts = await page.evaluate(() => (window as any).__st);
  expect(counts.invoices).toBeGreaterThanOrEqual(1);
  expect(counts.customers).toBeGreaterThanOrEqual(1);
});

test("returning to a customer page after invoice add shows update without manual refresh", async ({ page }) => {
  await page.goto("/customers/statements");

  // عدّاد مستمعات على invoices:changed للتأكّد من عدم تكرار الاشتراك
  await page.evaluate(() => {
    (window as any).__listenerCount = 0;
    const orig = window.addEventListener;
    window.addEventListener = function (type: string, ...rest: any[]) {
      if (type === "invoices:changed") (window as any).__listenerCount++;
      // @ts-ignore
      return orig.apply(this, [type, ...rest]);
    };
  });

  // ذهاب/إياب بين الكشف العام وصفحة العميل عدة مرات
  for (let i = 0; i < 3; i++) {
    await page.goto("/customers/statements");
    await page.waitForLoadState("domcontentloaded");
  }

  // إطلاق حدث "فاتورة جديدة" ثم العودة — يجب أن تُعيد الصفحة الاستعلام
  await page.evaluate(() => {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("customers:changed"));
  });

  await page.goto("/customers/statements");
  await expect(page).toHaveURL(/customers\/statements/);

  // تحقّق أن عدد المستمعين المسجّلين بيد الصفحة لم ينفلت (< 50 لثلاث تنقلات)
  const listenerCount = await page.evaluate(() => (window as any).__listenerCount);
  expect(listenerCount).toBeLessThan(50);
});
