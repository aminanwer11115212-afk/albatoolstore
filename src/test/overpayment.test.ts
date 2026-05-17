import { describe, it, expect } from "vitest";
import { splitPayment } from "@/utils/overpayment";

describe("splitPayment — overpayment customer credit", () => {
  it("دفعة جزئية: لا فائض", () => {
    const r = splitPayment({ amount: 300, total: 1000, alreadyPaid: 0 });
    expect(r).toEqual({ applied: 300, overpay: 0, newPaid: 300, newDue: 700 });
  });

  it("دفعة كاملة بالضبط", () => {
    const r = splitPayment({ amount: 1000, total: 1000, alreadyPaid: 0 });
    expect(r).toEqual({ applied: 1000, overpay: 0, newPaid: 1000, newDue: 0 });
  });

  it("دفعة بفائض: 2000 على فاتورة 1000", () => {
    const r = splitPayment({ amount: 2000, total: 1000, alreadyPaid: 0 });
    expect(r.applied).toBe(1000);
    expect(r.overpay).toBe(1000);
    expect(r.newPaid).toBe(1000);
    expect(r.newDue).toBe(0);
  });

  it("دفعة بفائض على فاتورة مدفوعة جزئياً", () => {
    const r = splitPayment({ amount: 800, total: 1000, alreadyPaid: 400 });
    // المتبقي 600، إذن 600 يُطبَّق و200 فائض
    expect(r.applied).toBe(600);
    expect(r.overpay).toBe(200);
    expect(r.newPaid).toBe(1000);
    expect(r.newDue).toBe(0);
  });

  it("دفعة على فاتورة مقفلة بالفعل: كلها فائض", () => {
    const r = splitPayment({ amount: 500, total: 1000, alreadyPaid: 1000 });
    expect(r.applied).toBe(0);
    expect(r.overpay).toBe(500);
    expect(r.newPaid).toBe(1000);
    expect(r.newDue).toBe(0);
  });

  it("صفر مبلغ", () => {
    const r = splitPayment({ amount: 0, total: 1000, alreadyPaid: 0 });
    expect(r).toEqual({ applied: 0, overpay: 0, newPaid: 0, newDue: 1000 });
  });

  it("قِيَم سالبة تُعامَل كصفر", () => {
    const r = splitPayment({ amount: -100, total: 1000, alreadyPaid: 0 });
    expect(r.applied).toBe(0);
    expect(r.overpay).toBe(0);
  });
});
