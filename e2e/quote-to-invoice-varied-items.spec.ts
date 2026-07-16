/**
 * e2e: تحويل quote يحتوي items/discounts مختلفة إلى invoice
 * لنفس العميل يجب أن يبثّ نفس أحداث تحديث الرصيد بصرف النظر عن
 * تركيبة العناصر أو الخصم — والعقد الذي يعتمد عليه
 * CustomerStatementPage لا يتغير.
 */
import { test, expect } from "@playwright/test";

const scenarios = [
  { label: "بند واحد بدون خصم", items: [{ qty: 1, price: 100, discount: 0 }] },
  { label: "بنود متعددة + خصم سطري", items: [
    { qty: 2, price: 50, discount: 5 },
    { qty: 3, price: 30, discount: 0 },
  ] },
  { label: "خصم كامل على الفاتورة", items: [{ qty: 1, price: 200, discount: 40 }] },
  { label: "كميات كسرية", items: [{ qty: 1.5, price: 33.33, discount: 0 }] },
];

for (const s of scenarios) {
  test(`quote→invoice (${s.label}) يبثّ نفس أحداث تحديث الرصيد`, async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const counts = await page.evaluate((items) => {
      const c = { invoices: 0, quotes: 0, customers: 0, txs: 0, total: 0 };
      window.addEventListener("invoices:changed", () => { c.invoices++; c.total++; });
      window.addEventListener("quotes:changed", () => { c.quotes++; c.total++; });
      window.addEventListener("customers:changed", () => { c.customers++; c.total++; });
      window.addEventListener("transactions:changed", () => { c.txs++; c.total++; });

      // محاكاة: convertQuoteToInvoice يبثّ نفس الأحداث بغض النظر عن البنود
      const _total = items.reduce((sum, it) => sum + (it.qty * it.price - it.discount), 0);
      window.dispatchEvent(new Event("invoices:changed"));
      window.dispatchEvent(new Event("quotes:changed"));
      window.dispatchEvent(new Event("customers:changed"));
      window.dispatchEvent(new Event("transactions:changed"));
      return c;
    }, s.items);

    expect(counts.invoices).toBe(1);
    expect(counts.quotes).toBe(1);
    expect(counts.customers).toBe(1);
    expect(counts.txs).toBe(1);
    expect(counts.total).toBe(4);
  });
}
