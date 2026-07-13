import { describe, it, expect } from "vitest";

/**
 * اختبار تكامل يحاكي منطق triggers الخاص بإعادة حساب رصيد العميل:
 *   - trg_invoices_recompute_cust_balance
 *   - trg_tx_recompute_cust_balance
 *
 * المرجع من الـDB (recompute_customer_balance):
 *   balance        = Σ GREATEST(total − paid_amount, 0)
 *                    (فواتير غير ملغاة، source != 'pos')
 *   credit_balance = Σ amount من transactions
 *                    (category = 'customer_credit')
 */

type Invoice = {
  id: string;
  total: number;
  paid_amount: number;
  status?: "pending" | "partial" | "paid" | "cancelled" | "overdue";
  source?: "pos" | null;
};
type Tx = {
  customer_id: string;
  category: "customer_credit" | string;
  amount: number;
};

function recomputeBalance(invoices: Invoice[]): number {
  let bal = 0;
  for (const i of invoices) {
    if ((i.status ?? "") === "cancelled") continue;
    if ((i.source ?? "") === "pos") continue;
    bal += Math.max((i.total || 0) - (i.paid_amount || 0), 0);
  }
  return bal;
}

function recomputeCredit(txs: Tx[]): number {
  return txs
    .filter((t) => t.category === "customer_credit")
    .reduce((s, t) => s + (t.amount || 0), 0);
}

/** يحاكي دفعة مع خصم اختياري: يخفض total بمقدار الخصم ثم يرفع paid_amount. */
function applyPaymentWithDiscount(
  inv: Invoice,
  payment: number,
  discount = 0,
): { inv: Invoice; overpay: number } {
  const newTotal = Math.max((inv.total || 0) - discount, 0);
  const remaining = Math.max(newTotal - (inv.paid_amount || 0), 0);
  const applied = Math.min(payment, remaining);
  const overpay = Math.max(payment - remaining, 0);
  return {
    inv: { ...inv, total: newTotal, paid_amount: (inv.paid_amount || 0) + applied },
    overpay,
  };
}

describe("trg_invoices_recompute_cust_balance — دفعة + خصم", () => {
  it("خصم جزئي مع دفعة جزئية يعيد الحساب بدقة (>= 0)", () => {
    const inv: Invoice = { id: "1", total: 1000, paid_amount: 0 };
    const { inv: after } = applyPaymentWithDiscount(inv, 400, 200);
    expect(after.total).toBe(800);
    expect(after.paid_amount).toBe(400);
    expect(recomputeBalance([after])).toBe(400);
  });

  it("خصم كامل يساوي المتبقّي يصفّر الرصيد", () => {
    const inv: Invoice = { id: "1", total: 500, paid_amount: 0 };
    const { inv: after } = applyPaymentWithDiscount(inv, 0, 500);
    expect(recomputeBalance([after])).toBe(0);
  });

  it("خصم + دفعة كاملة → paid ورصيد = 0", () => {
    const inv: Invoice = { id: "1", total: 1000, paid_amount: 0 };
    const { inv: after } = applyPaymentWithDiscount(inv, 800, 200);
    expect(after.total).toBe(800);
    expect(after.paid_amount).toBe(800);
    expect(recomputeBalance([after])).toBe(0);
  });

  it("خصم أكبر من المتبقّي لا يُنتج رصيدًا سالبًا", () => {
    const inv: Invoice = { id: "1", total: 1000, paid_amount: 300 };
    const { inv: after } = applyPaymentWithDiscount(inv, 0, 5000);
    expect(after.total).toBe(0);
    expect(recomputeBalance([after])).toBe(0);
  });

  it("الفواتير الملغاة و POS تُستثنى من إعادة الحساب", () => {
    const invs: Invoice[] = [
      { id: "a", total: 9999, paid_amount: 0, status: "cancelled" },
      { id: "b", total: 4444, paid_amount: 0, source: "pos" },
      { id: "c", total: 300, paid_amount: 0 },
    ];
    expect(recomputeBalance(invs)).toBe(300);
  });
});

describe("trg_tx_recompute_cust_balance — customer_credit فقط يؤثر", () => {
  it("دفعة زائدة عن المتبقّي بعد الخصم تُسجَّل رصيدًا للعميل (له)", () => {
    const inv: Invoice = { id: "1", total: 1000, paid_amount: 0 };
    const { inv: after, overpay } = applyPaymentWithDiscount(inv, 900, 200);
    // بعد الخصم: total=800, paid=800 → مسدّدة كاملة
    expect(recomputeBalance([after])).toBe(0);
    // الفائض 100 يُضاف كـ customer_credit عبر transactions
    const txs: Tx[] = [{ customer_id: "c", category: "customer_credit", amount: overpay }];
    expect(recomputeCredit(txs)).toBe(100);
  });

  it("التصنيفات الأخرى لا تُحدث credit_balance", () => {
    const txs: Tx[] = [
      { customer_id: "c", category: "customer_credit", amount: 50 },
      { customer_id: "c", category: "customer_payment", amount: 500 },
      { customer_id: "c", category: "sale", amount: 200 },
    ];
    expect(recomputeCredit(txs)).toBe(50);
  });

  it("خصم كامل + لا دفعة → balance=0 و credit=0", () => {
    const inv: Invoice = { id: "1", total: 700, paid_amount: 0 };
    const { inv: after, overpay } = applyPaymentWithDiscount(inv, 0, 700);
    expect(recomputeBalance([after])).toBe(0);
    expect(recomputeCredit([{ customer_id: "c", category: "customer_credit", amount: overpay }])).toBe(0);
  });
});
