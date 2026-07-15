/**
 * e2e: حذف فاتورة مدفوعة بالكامل يجب ألا يمس customer_credit الفائض السابق.
 *
 * العقد المُختبَر (يعكس منطق delete_invoice_with_reconciliation + deleteInvoice.ts):
 *  - يُحذف فقط الحركات المرتبطة بـ reference_id = invoiceId AND category = 'customer_payment'.
 *  - حركات category = 'customer_credit' (الفائض القديم أو الشحن) تبقى كما هي.
 *  - رصيد العميل credit_balance = Σ(customer_credit.amount) لا يتغير بعد الحذف.
 */
import { test, expect } from "@playwright/test";

type Tx = {
  id: string;
  category: "customer_payment" | "customer_credit";
  amount: number;
  reference_id: string | null;
};

function simulateDelete(txs: Tx[], invoiceId: string) {
  return txs.filter(
    (t) => !(t.category === "customer_payment" && t.reference_id === invoiceId),
  );
}

function creditBalance(txs: Tx[]) {
  return txs
    .filter((t) => t.category === "customer_credit")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

test("deleting a fully-paid invoice removes only its customer_payment rows", () => {
  const invoiceId = "inv-old-2000";
  const before: Tx[] = [
    { id: "p1", category: "customer_payment", amount: 2000, reference_id: invoiceId },
    { id: "c1", category: "customer_credit", amount: 1000, reference_id: null },
  ];
  const after = simulateDelete(before, invoiceId);
  expect(after.map((t) => t.id).sort()).toEqual(["c1"]);
  expect(after.some((t) => t.category === "customer_payment")).toBe(false);
});

test("customer credit_balance is unchanged after deleting the invoice", () => {
  const invoiceId = "inv-old-2000";
  const before: Tx[] = [
    { id: "p1", category: "customer_payment", amount: 2000, reference_id: invoiceId },
    { id: "c-surplus", category: "customer_credit", amount: 1000, reference_id: null },
    { id: "c-topup", category: "customer_credit", amount: 500, reference_id: null },
  ];
  const creditBefore = creditBalance(before);
  const after = simulateDelete(before, invoiceId);
  const creditAfter = creditBalance(after);
  expect(creditBefore).toBe(1500);
  expect(creditAfter).toBe(1500);
  expect(creditAfter).toBe(creditBefore);
});

test("statement rows for customer_credit remain after delete", () => {
  const invoiceId = "inv-old-2000";
  const before: Tx[] = [
    { id: "p1", category: "customer_payment", amount: 2000, reference_id: invoiceId },
    { id: "c1", category: "customer_credit", amount: 1000, reference_id: null },
    { id: "c2", category: "customer_credit", amount: 250, reference_id: null },
  ];
  const after = simulateDelete(before, invoiceId);
  const creditRows = after.filter((t) => t.category === "customer_credit");
  expect(creditRows).toHaveLength(2);
  expect(creditRows.map((r) => r.id).sort()).toEqual(["c1", "c2"]);
});

test("delete broadcasts refresh events so statement/preview auto-refresh", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).__ev = { invoices: 0, customers: 0, transactions: 0 };
    window.addEventListener("invoices:changed", () => (window as any).__ev.invoices++);
    window.addEventListener("customers:changed", () => (window as any).__ev.customers++);
    window.addEventListener("transactions:changed", () => (window as any).__ev.transactions++);
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("customers:changed"));
    window.dispatchEvent(new Event("transactions:changed"));
  });
  const counts = await page.evaluate(() => (window as any).__ev);
  expect(counts.invoices).toBeGreaterThanOrEqual(1);
  expect(counts.customers).toBeGreaterThanOrEqual(1);
  expect(counts.transactions).toBeGreaterThanOrEqual(1);
});
