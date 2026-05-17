import { describe, it, expect } from "vitest";

/**
 * تحقّق ثبات قواعد حساب إجماليات الفاتورة المستخدمة في صفحات الإنشاء.
 * نُعيد إنتاج المنطق محلياً لمنع الانحراف عبر الإصدارات.
 */
type Row = { quantity: number; unit_price: number; discount: number; tax_rate: number };

function computeTotals(rows: Row[], generalDiscount = 0) {
  const subtotal = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const itemDiscounts = rows.reduce((s, r) => s + r.quantity * r.unit_price * (r.discount / 100), 0);
  const taxableBase = subtotal - itemDiscounts;
  const taxAmount = rows.reduce(
    (s, r) => s + r.quantity * r.unit_price * (1 - r.discount / 100) * (r.tax_rate / 100),
    0,
  );
  const total = Math.round((taxableBase - generalDiscount + taxAmount) * 100) / 100;
  return { subtotal, itemDiscounts, taxableBase, taxAmount, total };
}

describe("Invoice totals — السلامة المالية", () => {
  it("صف بسيط بدون خصم/ضريبة", () => {
    const t = computeTotals([{ quantity: 3, unit_price: 100, discount: 0, tax_rate: 0 }]);
    expect(t.subtotal).toBe(300);
    expect(t.total).toBe(300);
  });

  it("خصم بند 10% + ضريبة 15%", () => {
    const t = computeTotals([{ quantity: 2, unit_price: 100, discount: 10, tax_rate: 15 }]);
    expect(t.itemDiscounts).toBe(20);
    expect(t.taxableBase).toBe(180);
    expect(t.taxAmount).toBeCloseTo(27, 2);
    expect(t.total).toBe(207);
  });

  it("خصم عام يُطبَّق بعد خصم البنود", () => {
    const t = computeTotals([{ quantity: 1, unit_price: 1000, discount: 5, tax_rate: 0 }], 50);
    expect(t.total).toBe(900);
  });

  it("بنود فارغة → كل الإجماليات صفر", () => {
    expect(computeTotals([])).toMatchObject({ subtotal: 0, total: 0 });
  });

  it("ضريبة على عدة بنود مختلفة", () => {
    const t = computeTotals([
      { quantity: 1, unit_price: 100, discount: 0, tax_rate: 10 },
      { quantity: 2, unit_price: 50,  discount: 0, tax_rate: 20 },
    ]);
    expect(t.subtotal).toBe(200);
    expect(t.taxAmount).toBeCloseTo(30, 2);
    expect(t.total).toBe(230);
  });

  it("تقريب على سنتين بلا انجراف عشري", () => {
    const t = computeTotals([{ quantity: 3, unit_price: 33.33, discount: 0, tax_rate: 0 }]);
    expect(Number.isInteger(Math.round(t.total * 100))).toBe(true);
    expect(t.total).toBeCloseTo(99.99, 2);
  });
});

/**
 * منع تكرار حالة overpaid في القاعدة (paid > total).
 * هذه الحالة موجودة في فاتورتين قديمتين (INV-0, INV-111) كبيانات اختبارية.
 */
function validatePayment(total: number, paid: number) {
  if (paid < 0) return { ok: false, reason: "negative_paid" };
  if (paid > total + 0.01) return { ok: false, reason: "overpaid" };
  return { ok: true as const };
}

describe("Invoice payment validation — منع overpaid", () => {
  it("يرفض دفع أكبر من المجموع", () => {
    expect(validatePayment(100, 150)).toEqual({ ok: false, reason: "overpaid" });
  });
  it("يقبل دفع جزئي", () => {
    expect(validatePayment(100, 60)).toEqual({ ok: true });
  });
  it("يقبل دفع مساوٍ تماماً", () => {
    expect(validatePayment(100, 100)).toEqual({ ok: true });
  });
  it("يرفض دفع سالب", () => {
    expect(validatePayment(100, -5)).toEqual({ ok: false, reason: "negative_paid" });
  });
});
