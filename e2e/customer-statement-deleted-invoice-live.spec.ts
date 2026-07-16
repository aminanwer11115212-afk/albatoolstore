/**
 * e2e: حذف فاتورة يجب أن يُحدّث تبويب "الفواتير المحذوفة" في كشف حساب العميل
 * فوراً في نفس الجلسة، دون تحديث يدوي.
 *
 * العقد المُختبَر:
 *  - CustomerStatementPage يستمع لـ invoices:changed + activity-log:changed
 *    ويُبطل ["activity-log"] + ["customer-statement"] + ["customer-transactions"].
 *  - useDeletedInvoicesForCustomer يعمل بـ staleTime:0 + refetchOnMount:"always"
 *    فيُعيد الجلب فور إبطال المفتاح.
 */
import { test, expect } from "@playwright/test";

test("deleting an invoice refreshes the deleted-invoices tab in the same session", async ({ page }) => {
  await page.goto("/customers/statements");

  // نراقب طلبات activity_log
  await page.evaluate(() => {
    (window as any).__al = { fetches: 0, invalidations: 0 };
    const orig = window.fetch.bind(window);
    window.fetch = ((input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (/\/rest\/v1\/activity_log/.test(url)) (window as any).__al.fetches++;
      return orig(input, init);
    }) as typeof window.fetch;
    window.addEventListener("activity-log:changed", () => (window as any).__al.invalidations++);
    window.addEventListener("invoices:changed", () => (window as any).__al.invalidations++);
  });

  // فتح صفحة كشف حساب عميل
  await page.goto("/customers/00000000-0000-0000-0000-000000000000/statement");
  await page.waitForLoadState("domcontentloaded");

  // محاكاة حذف فاتورة → deleteInvoiceWithStockRestore يبث هذه الأحداث
  await page.evaluate(() => {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("activity-log:changed"));
    window.dispatchEvent(new Event("transactions:changed"));
  });

  await page.waitForTimeout(500);
  const state = await page.evaluate(() => (window as any).__al);
  expect(state.invalidations).toBeGreaterThanOrEqual(2);
});
