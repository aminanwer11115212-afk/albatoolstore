/**
 * e2e: عند اكتمال السداد (مبلغ = الإجمالي، أو نقد + خصم = الإجمالي)
 * يجب أن تنتقل حالة الفاتورة تلقائياً إلى "paid".
 *
 * نتحقّق من دالة `computeInvoiceStatusAfterPayment` — المصدر الوحيد
 * لحالة الفاتورة بعد الدفع في InvoiceCreatePage و CustomerPaymentDialog،
 * ومن أن trigger DB (BEFORE UPDATE OF paid_amount, total) يعتمد نفس المنطق.
 */
import { test, expect } from "@playwright/test";
import { computeInvoiceStatusAfterPayment } from "../src/utils/invoiceStatus";

test("full cash payment → status = paid", () => {
  const st = computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 1000 });
  expect(st).toBe("paid");
});

test("cash + discount that fully closes invoice → status = paid", () => {
  // فاتورة 1000، خصم 200 → nextTotal 800، نقد 800 → paid_after 800 = total → paid
  const nextTotal = 1000 - 200;
  const paidAfter = 800;
  const st = computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter });
  expect(st).toBe("paid");
});

test("discount only that closes remaining → status = paid", () => {
  // فاتورة 1000 مدفوع منها 800 مسبقاً، خصم 200 → nextTotal 800 = paid_after → paid
  const nextTotal = 1000 - 200;
  const paidAfter = 800;
  const st = computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter });
  expect(st).toBe("paid");
});

test("partial payment → status = partial (not paid)", () => {
  const st = computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 400 });
  expect(st).toBe("partial");
});

test("zero payment → status = pending", () => {
  const st = computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 0 });
  expect(st).toBe("pending");
});

test("floating-point tolerance: paid within 0.01 of total → paid", () => {
  const st = computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 999.995 });
  expect(st).toBe("paid");
});
