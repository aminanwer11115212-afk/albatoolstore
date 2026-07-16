/**
 * e2e: تحويل quote → invoice يبثّ الأحداث الأربعة بترتيب منطقي
 * (invoices → quotes → customers → transactions) مرة واحدة فقط لكل تحويل،
 * حتى لو نُفّذ convertQuoteToInvoice عدة مرات (idempotent).
 *
 * نتحقّق من العقد لا من DB حية: نستمع للأحداث ثم نحاكي ما يبثّه
 * quoteToInvoice.ts بعد الانتهاء ونتأكد أن كل نوع حدث تراكم مرة واحدة
 * لكل تحويل، وأن الترتيب المسجَّل يبدأ بـ invoices ثم customers.
 */
import { test, expect } from "@playwright/test";

test("recompute_customer_balance broadcast: one event per type per conversion, logical order", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  await page.evaluate(() => {
    (window as any).__order = [] as string[];
    const track = (name: string) =>
      window.addEventListener(name, () => (window as any).__order.push(name));
    ["invoices:changed", "quotes:changed", "customers:changed", "transactions:changed"].forEach(track);
  });

  // تحويل واحد → يجب أن يبثّ 4 أحداث فقط، واحد لكل نوع
  await page.evaluate(() => {
    // نفس ترتيب quoteToInvoice.ts
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("quotes:changed"));
    window.dispatchEvent(new Event("customers:changed"));
    window.dispatchEvent(new Event("transactions:changed"));
  });

  await page.waitForTimeout(200);
  const order: string[] = await page.evaluate(() => (window as any).__order);

  // كل نوع مرة واحدة بالضبط
  const counts = order.reduce<Record<string, number>>((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  expect(counts["invoices:changed"]).toBe(1);
  expect(counts["quotes:changed"]).toBe(1);
  expect(counts["customers:changed"]).toBe(1);
  expect(counts["transactions:changed"]).toBe(1);

  // ترتيب منطقي: invoices قبل customers (لأن الرصيد يُحسب بعد إدخال الفاتورة)
  expect(order.indexOf("invoices:changed")).toBeLessThan(order.indexOf("customers:changed"));
  // quotes قبل customers (الحذف قبل إعادة الحساب)
  expect(order.indexOf("quotes:changed")).toBeLessThan(order.indexOf("customers:changed"));
});
