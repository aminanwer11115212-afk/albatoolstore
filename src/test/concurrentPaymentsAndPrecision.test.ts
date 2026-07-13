import { describe, it, expect } from "vitest";

/**
 * محاكاة تنفيذ متزامن لدفعتين على فاتورتين مختلفتين لعميل واحد.
 * كل دفعة تُحدّث فاتورتها + قد تُنشئ transaction من نوع customer_credit.
 * بعد الانتهاء، تُعيد الـtriggers حساب:
 *   balance = Σ GREATEST(total − paid, 0)
 *   credit_balance = Σ amount من transactions (customer_credit)
 * يجب ألا يعتمد الناتج على ترتيب التنفيذ.
 */

type Invoice = { id: string; total: number; paid: number };
type Tx = { category: string; amount: number };

function recomputeBalance(inv: Invoice[]) {
  return inv.reduce((s, i) => s + Math.max(i.total - i.paid, 0), 0);
}
function recomputeCredit(tx: Tx[]) {
  return tx.filter((t) => t.category === "customer_credit").reduce((s, t) => s + t.amount, 0);
}

async function applyPayment(
  invoices: Invoice[],
  txs: Tx[],
  invId: string,
  payment: number,
  discount: number,
) {
  // محاكاة IO عشوائي لتشابك التنفيذ
  await new Promise((r) => setTimeout(r, Math.random() * 10));
  const inv = invoices.find((i) => i.id === invId)!;
  inv.total = Math.max(inv.total - discount, 0);
  const remaining = Math.max(inv.total - inv.paid, 0);
  const applied = Math.min(payment, remaining);
  inv.paid += applied;
  const overpay = payment - applied;
  if (overpay > 0) txs.push({ category: "customer_credit", amount: overpay });
}

describe("دفعتان متزامنتان لعميل واحد — triggers دون تضارب", () => {
  it("النتيجة النهائية لا تعتمد على ترتيب التشغيل", async () => {
    const runOnce = async () => {
      const invs: Invoice[] = [
        { id: "a", total: 1000, paid: 0 },
        { id: "b", total: 700, paid: 0 },
      ];
      const txs: Tx[] = [];
      await Promise.all([
        applyPayment(invs, txs, "a", 900, 200), // بعد الخصم total=800 paid=800 → 0
        applyPayment(invs, txs, "b", 800, 100), // total=600 paid=600 → 0, overpay 200
      ]);
      return { bal: recomputeBalance(invs), credit: recomputeCredit(txs) };
    };
    const results = await Promise.all(Array.from({ length: 10 }, runOnce));
    for (const r of results) {
      expect(r.bal).toBe(0);
      // overpay a = 900-800=100, overpay b = 800-600=200 → إجمالي 300
      expect(r.credit).toBe(300);
    }
  });

  it("دفعتان جزئيتان على نفس الفاتورة — المجموع صحيح", async () => {
    const invs: Invoice[] = [{ id: "a", total: 1000, paid: 0 }];
    const txs: Tx[] = [];
    await Promise.all([
      applyPayment(invs, txs, "a", 300, 100), // total 900
      applyPayment(invs, txs, "a", 200, 50), //  total 850
    ]);
    // total النهائي 850، paid = 500 (كلاهما ضمن المتبقّي)، balance = 350
    // ملاحظة: الترتيب يؤثر على قيمة total الوسيطة لكن ليس على المجموع النهائي
    // (خصم كامل 150، دفع كامل 500) → balance = 1000 - 150 - 500 = 350
    expect(recomputeBalance(invs)).toBe(350);
    expect(recomputeCredit(txs)).toBe(0);
  });
});

describe("الخصم مع أرقام عشرية / precision", () => {
  const EPS = 0.01;

  it("خصم عشري 33.33% تقريبًا لا يُنتج قيمًا سالبة", () => {
    const total = 1000;
    const discount = Number(((total * 33.33) / 100).toFixed(2)); // 333.30
    const newTotal = Math.max(total - discount, 0);
    expect(newTotal).toBeCloseTo(666.7, 2);
    expect(newTotal).toBeGreaterThanOrEqual(0);
  });

  it("مجموع خصومات متعددة عشرية على فواتير متعددة يطابق مجموع المتبقي", () => {
    const rows = [
      { total: 100.1, paid: 0, discount: 0.05 },
      { total: 250.55, paid: 50.25, discount: 10.3 },
      { total: 999.99, paid: 0, discount: 999.99 }, // خصم كامل
      { total: 33.34, paid: 33.34, discount: 0 }, // مسددة كامل
    ];
    let bal = 0;
    for (const r of rows) {
      const t = Math.max(r.total - r.discount, 0);
      bal += Math.max(t - r.paid, 0);
    }
    // 100.05 + (240.25 - 50.25) + 0 + 0 = 290.05
    expect(bal).toBeCloseTo(290.05, 2);
    expect(bal).toBeGreaterThanOrEqual(0);
  });

  it("خصم يجعل total = paid ضمن هامش الـEPS → مسددة (لا سالب)", () => {
    const total = 1000.01;
    const paid = 999.995;
    const discount = 0.02;
    const newTotal = Math.max(total - discount, 0); // 999.99
    const remaining = Math.max(newTotal - paid, 0); // 0 ضمن EPS
    expect(remaining).toBeLessThan(EPS);
  });

  it("عملات متعددة — كل عملة تُحسب باستقلال دون خلط أخطاء التقريب", () => {
    const usd = [{ total: 100.33, paid: 50.11, discount: 0.22 }];
    const sdg = [{ total: 60000.75, paid: 20000.25, discount: 500.5 }];
    const usdBal = usd.reduce(
      (s, r) => s + Math.max(Math.max(r.total - r.discount, 0) - r.paid, 0),
      0,
    );
    const sdgBal = sdg.reduce(
      (s, r) => s + Math.max(Math.max(r.total - r.discount, 0) - r.paid, 0),
      0,
    );
    expect(usdBal).toBeCloseTo(50.0, 2);
    expect(sdgBal).toBeCloseTo(39500.0, 2);
    // لا خلط
    expect(usdBal + sdgBal).not.toBe(NaN);
  });

  it("خصم بمقدار كسر صغير جدًا لا يحوّل الرصيد إلى قيمة سالبة", () => {
    const total = 0.01;
    const discount = 0.02;
    expect(Math.max(total - discount, 0)).toBe(0);
  });
});
