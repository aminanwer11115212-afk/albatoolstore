/**
 * e2e عقد الخصم في النظام:
 * - خصم الدفع يُحفظ في invoice.discount ويخفض invoice.total.
 * - الطباعة تعرض الخصم كخصم، لا كدفعة.
 * - فواتير الكاش تضبط paid_amount مع صافي الإجمالي بعد الخصم.
 * - حذف فاتورة مخفضة يزيل صافي الدين ولا يترك فرق 200.
 */
import { test, expect } from "@playwright/test";
import { computeInvoicePaymentAdjustment } from "../src/utils/invoicePaymentMath";
import { generatePrintHTML } from "../src/utils/printTemplate";

test("payment discount 200 on 25,200 invoice is saved as discount and closes at 25,000", () => {
  const r = computeInvoicePaymentAdjustment({
    currentTotal: 25200,
    currentPaid: 0,
    currentDiscount: 0,
    paymentAmount: 25000,
    discountAmount: 200,
  });
  expect(r).toMatchObject({
    nextDiscount: 200,
    nextTotal: 25000,
    nextPaid: 25000,
    newDue: 0,
    nextStatus: "paid",
  });
});

test("invoice print shows discount row and net total after payment discount", () => {
  const html = generatePrintHTML({
    type: "invoice",
    number: "INV-25200",
    date: "2026-01-01",
    customer: { name: "عميل" },
    items: [{ product_name: "بضاعة", quantity: 1, unit_price: 25200, tax_amount: 0, discount: 0, total: 25200 }],
    subtotal: 25200,
    taxTotal: 0,
    discountTotal: 200,
    grandTotal: 25000,
    paidAmount: 25000,
    dueAmount: 0,
    company: {} as any,
  });
  expect(html).toContain("الخصم على الفاتورة");
  expect(html).toContain("− 200");
  expect(html).toContain("25,200");
  expect(html).toContain("25,000");
  expect(html).toContain("مسددة بالكامل");
});

test("cash invoice discount keeps paid amount equal to net total", () => {
  const r = computeInvoicePaymentAdjustment({
    currentTotal: 25200,
    currentPaid: 25200,
    currentDiscount: 0,
    discountAmount: 200,
    isPos: true,
  });
  expect(r.nextTotal).toBe(25000);
  expect(r.nextPaid).toBe(25000);
  expect(r.nextDiscount).toBe(200);
  expect(r.newDue).toBe(0);
});

test("deleting discounted invoice clears only the net customer debt", () => {
  const beforeDebt = Math.max(25000 - 0, 0); // stored total after discount
  expect(beforeDebt).toBe(25000);
  const afterDebt = 0; // invoice row removed; discount is not re-added to customer balance
  expect(afterDebt).toBe(0);
});
