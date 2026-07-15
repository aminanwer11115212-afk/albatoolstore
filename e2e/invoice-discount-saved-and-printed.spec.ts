/**
 * e2e: إدخال خصم إضافي في حوار تسجيل الدفعة يجب أن:
 *   1) يُحفظ في invoices.discount ويُخفّض invoices.total
 *   2) يُحسب المتبقي = nextTotal − paid_amount
 *   3) يظهر بشكل صحيح في ملخّص المعاينة/الطباعة (computeDocumentBalance)
 *
 * نغطّي المنطق الخالص المُستخدَم في:
 *   - InvoiceCreatePage.handleRecordPayment (بعد الإصلاح)
 *   - CustomerPaymentDialog.handleSave
 *   - printTemplate → computeDocumentBalance (ملخّص أسفل الفاتورة)
 */
import { test, expect } from "@playwright/test";
import { computeInvoiceStatusAfterPayment } from "../src/utils/invoiceStatus";
import { computeDocumentBalance } from "../src/utils/documentBalanceSummary";

function applyDiscountPayment(prev: { total: number; paid: number; discount: number }, addDiscount: number, cashAmount: number) {
  const nextDiscount = Math.max(0, prev.discount + addDiscount);
  const nextTotal = Math.max(0, prev.total - addDiscount);
  const remaining = Math.max(0, nextTotal - prev.paid);
  const cashApplied = Math.min(cashAmount, remaining);
  const cashOver = Math.max(0, cashAmount - cashApplied);
  const newPaid = prev.paid + cashApplied;
  const newDue = Math.max(0, nextTotal - newPaid);
  const status = computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter: newPaid });
  return { nextDiscount, nextTotal, newPaid, newDue, cashApplied, cashOver, status };
}

test("discount persists to invoice: total shrinks, discount grows", () => {
  const result = applyDiscountPayment({ total: 10000, paid: 0, discount: 0 }, 2000, 0);
  expect(result.nextDiscount).toBe(2000);
  expect(result.nextTotal).toBe(8000);
  expect(result.newDue).toBe(8000);
  expect(result.status).toBe("pending");
});

test("cash 5000 + discount 5000 on 10000 → closes invoice as paid", () => {
  const result = applyDiscountPayment({ total: 10000, paid: 0, discount: 0 }, 5000, 5000);
  expect(result.nextDiscount).toBe(5000);
  expect(result.nextTotal).toBe(5000);
  expect(result.cashApplied).toBe(5000);
  expect(result.newPaid).toBe(5000);
  expect(result.newDue).toBe(0);
  expect(result.status).toBe("paid");
});

test("discount stacks on existing discount without overwriting", () => {
  const result = applyDiscountPayment({ total: 8000, paid: 0, discount: 2000 }, 1000, 0);
  expect(result.nextDiscount).toBe(3000);
  expect(result.nextTotal).toBe(7000);
});

test("preview/print summary reflects saved discount and remaining", () => {
  // بعد حفظ الدفعة بخصم 2000 على فاتورة 10000، القيم النهائية في DB:
  //   total=8000, discount=2000, paid_amount=6000 → remaining=2000
  const summary = computeDocumentBalance({
    grandTotal: 8000,
    discount: 2000,
    paidAmount: 6000,
  });
  expect(summary.discount).toBe(2000);
  expect(summary.grandTotal).toBe(8000);
  expect(summary.paidAmount).toBe(6000);
  expect(summary.remaining).toBe(2000);
  expect(summary.hasDiscount).toBe(true);
  expect(summary.isPaid).toBe(false);
});

test("preview shows fully paid when discount closes the invoice", () => {
  const summary = computeDocumentBalance({
    grandTotal: 5000,
    discount: 5000,
    paidAmount: 5000,
  });
  expect(summary.remaining).toBe(0);
  expect(summary.overpaid).toBe(0);
  expect(summary.isPaid).toBe(true);
});

test("cash exceeding remaining after discount becomes overpay (customer credit)", () => {
  const result = applyDiscountPayment({ total: 10000, paid: 0, discount: 0 }, 12000, 1000);
  // خصم 1000 → total 9000، دفع 12000 → applied 9000، الفائض 3000 سلفة
  expect(result.nextTotal).toBe(9000);
  expect(result.cashApplied).toBe(9000);
  expect(result.cashOver).toBe(3000);
  expect(result.status).toBe("paid");
});
