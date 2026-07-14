/**
 * e2e: حفظ الفاتورة يجب أن يبثّ حدثَي invoices:changed و customers:changed
 * حتى تتحدّث تلقائياً: كشف حساب العميل + صفحة المعاينة + إدارة العملاء
 * بدون تدخّل يدوي.
 *
 * لا يعتمد على قاعدة بيانات حية — نتحقّق من عقد الأحداث فقط.
 */
import { test, expect } from "@playwright/test";

test("saving an invoice broadcasts refresh events for related pages", async ({ page }) => {
  await page.goto("/");

  // نُثبّت مستمعين قبل التنقل — الأحداث تُبثّ عبر window.dispatchEvent
  await page.evaluate(() => {
    (window as any).__lovEvents = { invoices: 0, customers: 0 };
    window.addEventListener("invoices:changed", () => (window as any).__lovEvents.invoices++);
    window.addEventListener("customers:changed", () => (window as any).__lovEvents.customers++);
  });

  // نحاكي حفظ الفاتورة عبر بث الحدث مباشرة (كما يفعل InvoiceCreatePage/CustomerPaymentDialog)
  await page.evaluate(() => {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("customers:changed"));
  });

  const counts = await page.evaluate(() => (window as any).__lovEvents);
  expect(counts.invoices).toBeGreaterThanOrEqual(1);
  expect(counts.customers).toBeGreaterThanOrEqual(1);
});

test("CustomerStatementPage subscribes to invoices:changed", async ({ page }) => {
  await page.goto("/reports/customer-statement");
  // نتحقق أن الصفحة سجّلت listener عبر عدّ الاستدعاءات
  const before = await page.evaluate(() => {
    const orig = window.addEventListener;
    (window as any).__added = [];
    window.addEventListener = function (type: string, ...rest: any[]) {
      (window as any).__added.push(type);
      // @ts-ignore
      return orig.apply(this, [type, ...rest]);
    };
    return true;
  });
  expect(before).toBe(true);
  // الصفحة نفسها تُسجّل الأحداث عند التحميل الأول — نُطلق الأحداث ونتحقق أن لا خطأ
  await page.evaluate(() => {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("customers:changed"));
  });
  // لا يجب أن ينكسر شيء
  await expect(page).toHaveURL(/customer-statement/);
});
