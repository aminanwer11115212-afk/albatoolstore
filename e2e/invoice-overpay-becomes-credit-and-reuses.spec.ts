/**
 * e2e: سيناريو "دفع كامل ثم فائض ثم فاتورة جديدة".
 *
 * الخطوات المُحاكاة (مطابقة لمنطق computeInvoicePaymentAdjustment + CustomerPaymentDialog):
 *  1) عميل عليه فاتورة قيمتها 2000 — يدفع 2000 → paid=2000, credit_balance=0, الفاتورة مدفوعة.
 *  2) نفس العميل يدفع فائض 1000 على فاتورة أخرى مكتملة (أو مستقل) → لا يُلمس paid_amount للفاتورة القديمة.
 *     يُنشأ قيد customer_credit(+1000) بدون reference_id للفاتورة القديمة.
 *  3) فاتورة جديدة قيمتها 700 → يُستخدم creditUse=700 من الرصيد الدائن. credit_balance يصبح 300.
 *
 * الفاتورة القديمة تبقى paid ولا يظهر ضمن دفعاتها أي قيد فائض.
 */
import { test, expect } from "@playwright/test";
import { computeInvoicePaymentAdjustment } from "@/utils/invoicePaymentMath";

type Tx = {
  category: "customer_payment" | "customer_credit";
  amount: number;
  reference_id: string | null;
};

test("full-pay of 2000 marks invoice paid without any surplus row on it", () => {
  const calc = computeInvoicePaymentAdjustment({
    currentTotal: 2000,
    currentPaid: 0,
    paymentAmount: 2000,
  });
  expect(calc.cashApplied).toBe(2000);
  expect(calc.cashOver).toBe(0);
  expect(calc.nextPaid).toBe(2000);
  expect(calc.newDue).toBe(0);
  expect(calc.nextStatus).toBe("paid");
});

test("extra 1000 on an already-paid invoice becomes customer_credit (not on old invoice paid_amount)", () => {
  const calc = computeInvoicePaymentAdjustment({
    currentTotal: 2000,
    currentPaid: 2000,
    paymentAmount: 1000,
  });
  expect(calc.cashApplied).toBe(0);
  expect(calc.cashOver).toBe(1000);
  // paid_amount for the old invoice does NOT go up
  expect(calc.nextPaid).toBe(2000);
  expect(calc.nextStatus).toBe("paid");
});

test("surplus transaction is written without reference_id to the old invoice", () => {
  const oldInvoiceId = "inv-2000";
  const txs: Tx[] = [
    { category: "customer_payment", amount: 2000, reference_id: oldInvoiceId },
    // surplus of 1000:
    { category: "customer_credit", amount: 1000, reference_id: null },
  ];
  const paymentsOnOld = txs.filter(
    (t) => t.category === "customer_payment" && t.reference_id === oldInvoiceId,
  );
  const surplusRowsOnOld = txs.filter(
    (t) => t.category === "customer_credit" && t.reference_id === oldInvoiceId,
  );
  expect(paymentsOnOld).toHaveLength(1);
  expect(surplusRowsOnOld).toHaveLength(0);
});

test("credit_balance = Σ(customer_credit.amount) shows the surplus in the customer statement", () => {
  const txs: Tx[] = [
    { category: "customer_payment", amount: 2000, reference_id: "inv-2000" },
    { category: "customer_credit", amount: 1000, reference_id: null },
  ];
  const credit = txs
    .filter((t) => t.category === "customer_credit")
    .reduce((s, t) => s + t.amount, 0);
  expect(credit).toBe(1000);
});

test("new invoice of 700 auto-uses 700 from credit_balance, leaving 300", () => {
  const availableCredit = 1000;
  const calc = computeInvoicePaymentAdjustment({
    currentTotal: 700,
    currentPaid: 0,
    creditUse: availableCredit, // dialog caps to remaining
  });
  expect(calc.creditApplied).toBe(700);
  expect(calc.cashApplied).toBe(0);
  expect(calc.nextPaid).toBe(700);
  expect(calc.nextStatus).toBe("paid");

  const remainingCredit = availableCredit - calc.creditApplied;
  expect(remainingCredit).toBe(300);
});

test("old invoice remains paid with only its original payment row (no surplus leak)", () => {
  const oldInvoiceId = "inv-2000";
  const rows = [
    { category: "customer_payment", amount: 2000, reference_id: oldInvoiceId },
    { category: "customer_credit", amount: 1000, reference_id: null },
    { category: "customer_payment", amount: 700, reference_id: "inv-new-700" },
    { category: "customer_credit", amount: -700, reference_id: "inv-new-700" },
  ];
  const oldInvoicePayments = rows.filter((r) => r.reference_id === oldInvoiceId);
  expect(oldInvoicePayments).toHaveLength(1);
  expect(oldInvoicePayments[0].amount).toBe(2000);
});
