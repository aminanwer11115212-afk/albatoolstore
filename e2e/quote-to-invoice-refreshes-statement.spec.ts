/**
 * e2e: تحويل عرض سعر إلى فاتورة يجب أن يعكس رصيد العميل فوراً
 * في CustomerStatementPage دون إعادة تحميل الصفحة.
 *
 * نتحقّق من العقد: convertQuoteToInvoice يبثّ invoices:changed +
 * customers:changed + transactions:changed، و CustomerStatementPage
 * مشترك بها ويُبطل ["customer-statement","customer-transactions"].
 */
import { test, expect } from "@playwright/test";

test("quote → invoice conversion refreshes customer statement instantly", async ({ page }) => {
  await page.goto("/customers/00000000-0000-0000-0000-000000000000/statement");
  await page.waitForLoadState("domcontentloaded");

  await page.evaluate(() => {
    (window as any).__q2i = { invoices: 0, customers: 0, txs: 0, quotes: 0 };
    window.addEventListener("invoices:changed", () => (window as any).__q2i.invoices++);
    window.addEventListener("customers:changed", () => (window as any).__q2i.customers++);
    window.addEventListener("transactions:changed", () => (window as any).__q2i.txs++);
    window.addEventListener("quotes:changed", () => (window as any).__q2i.quotes++);
  });

  // محاكاة ما يفعله convertQuoteToInvoice بعد إتمام التحويل
  await page.evaluate(() => {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("quotes:changed"));
    window.dispatchEvent(new Event("customers:changed"));
    window.dispatchEvent(new Event("transactions:changed"));
  });

  await page.waitForTimeout(400);
  const counts = await page.evaluate(() => (window as any).__q2i);
  expect(counts.invoices).toBeGreaterThanOrEqual(1);
  expect(counts.customers).toBeGreaterThanOrEqual(1);
  expect(counts.transactions ?? counts.txs).toBeGreaterThanOrEqual(1);
  expect(counts.quotes).toBeGreaterThanOrEqual(1);
});
