import { describe, it, expect } from "vitest";
import { validatePaymentAmount, computePaymentStatus, PAYMENT_EPS } from "@/utils/paymentValidation";

describe("validatePaymentAmount", () => {
  const base = { total: 1000, alreadyPaid: 0 };

  it("يرفض المبلغ الفارغ أو غير الرقمي", () => {
    expect(validatePaymentAmount({ ...base, amountInput: "" }).ok).toBe(false);
    expect(validatePaymentAmount({ ...base, amountInput: "abc" }).ok).toBe(false);
  });

  it("يرفض الصفر والسالب", () => {
    expect(validatePaymentAmount({ ...base, amountInput: 0 }).ok).toBe(false);
    expect(validatePaymentAmount({ ...base, amountInput: -50 }).ok).toBe(false);
  });

  it("يقبل دفعة جزئية صحيحة", () => {
    const r = validatePaymentAmount({ ...base, amountInput: "300" });
    expect(r.ok).toBe(true);
    expect(r.amount).toBe(300);
  });

  it("يقبل دفعة بقيمة كامل المتبقي", () => {
    const r = validatePaymentAmount({ total: 1000, alreadyPaid: 400, amountInput: 600 });
    expect(r.ok).toBe(true);
  });

  it("يرفض المبلغ الذي يتجاوز المتبقي", () => {
    const r = validatePaymentAmount({ total: 1000, alreadyPaid: 800, amountInput: 300 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/يتجاوز/);
  });

  it("يتسامح مع فروقات التقريب الصغيرة (≤ EPS)", () => {
    const r = validatePaymentAmount({ total: 1000, alreadyPaid: 999.995, amountInput: 0.01 });
    expect(r.ok).toBe(true);
  });

  it("يمنع تكرار نفس المبلغ خلال نافذة قصيرة", () => {
    const now = 10_000;
    const r = validatePaymentAmount({
      total: 1000, alreadyPaid: 0, amountInput: 200,
      lastPayment: { amount: 200, at: 9_000 },
      duplicateWindowMs: 3000,
      now,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/نفس المبلغ/);
  });

  it("يسمح بنفس المبلغ بعد انقضاء النافذة", () => {
    const now = 20_000;
    const r = validatePaymentAmount({
      total: 1000, alreadyPaid: 0, amountInput: 200,
      lastPayment: { amount: 200, at: 9_000 },
      duplicateWindowMs: 3000,
      now,
    });
    expect(r.ok).toBe(true);
  });

  it("يسمح بمبلغ مختلف ضمن النافذة", () => {
    const now = 10_000;
    const r = validatePaymentAmount({
      total: 1000, alreadyPaid: 0, amountInput: 250,
      lastPayment: { amount: 200, at: 9_000 },
      duplicateWindowMs: 3000,
      now,
    });
    expect(r.ok).toBe(true);
  });
});

describe("computePaymentStatus", () => {
  it("غير مدفوع عند 0", () => {
    expect(computePaymentStatus(0, 1000)).toBe("pending");
  });
  it("مدفوع جزئي", () => {
    expect(computePaymentStatus(400, 1000)).toBe("partial");
  });
  it("مدفوع بالكامل (مساوي)", () => {
    expect(computePaymentStatus(1000, 1000)).toBe("paid");
  });
  it("مدفوع بالكامل مع فرق تقريب طفيف", () => {
    expect(computePaymentStatus(999.995, 1000)).toBe("paid");
  });
  it("EPS قيمة معروفة", () => {
    expect(PAYMENT_EPS).toBeGreaterThan(0);
    expect(PAYMENT_EPS).toBeLessThanOrEqual(0.01);
  });
});
