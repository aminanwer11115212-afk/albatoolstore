import { describe, it, expect } from "vitest";
import { computeDocumentBalance } from "@/utils/documentBalanceSummary";

describe("computeDocumentBalance", () => {
  it("فاتورة مسددة بالكامل", () => {
    const r = computeDocumentBalance({ grandTotal: 100, paidAmount: 100 });
    expect(r.isPaid).toBe(true);
    expect(r.remaining).toBe(0);
    expect(r.overpaid).toBe(0);
  });

  it("فاتورة جزئية → متبقي", () => {
    const r = computeDocumentBalance({ grandTotal: 100, paidAmount: 40 });
    expect(r.remaining).toBe(60);
    expect(r.overpaid).toBe(0);
    expect(r.isPaid).toBe(false);
  });

  it("دفع زائد → overpaid", () => {
    const r = computeDocumentBalance({ grandTotal: 100, paidAmount: 150 });
    expect(r.overpaid).toBe(50);
    expect(r.remaining).toBe(0);
  });

  it("بدون دفع", () => {
    const r = computeDocumentBalance({ grandTotal: 200 });
    expect(r.remaining).toBe(200);
  });

  it("خصم يظهر عند > 0", () => {
    const r = computeDocumentBalance({ grandTotal: 100, discount: 15 });
    expect(r.hasDiscount).toBe(true);
    expect(r.discount).toBe(15);
  });

  it("لا خصم عند 0", () => {
    const r = computeDocumentBalance({ grandTotal: 100 });
    expect(r.hasDiscount).toBe(false);
  });

  it("رصيد مدين سابق", () => {
    const r = computeDocumentBalance({ grandTotal: 100, previousDebt: 500 });
    expect(r.hasPreviousDebt).toBe(true);
    expect(r.previousDebt).toBe(500);
  });

  it("رصيد دائن سابق", () => {
    const r = computeDocumentBalance({ grandTotal: 100, previousCredit: 200 });
    expect(r.hasPreviousCredit).toBe(true);
    expect(r.previousCredit).toBe(200);
  });

  it("قيم سالبة تُصفَّر", () => {
    const r = computeDocumentBalance({ grandTotal: -50, paidAmount: -10, previousDebt: -5 });
    expect(r.grandTotal).toBe(0);
    expect(r.paidAmount).toBe(0);
    expect(r.previousDebt).toBe(0);
  });

  it("فروق عشرية دقيقة لا تُعتبر متبقي", () => {
    const r = computeDocumentBalance({ grandTotal: 100, paidAmount: 99.995 });
    expect(r.remaining).toBe(0);
    expect(r.isPaid).toBe(true);
  });
});
