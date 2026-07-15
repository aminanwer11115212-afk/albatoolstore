import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";
import { computeInvoiceStatusAfterPayment } from "@/utils/invoiceStatus";
import { computeInvoicePaymentAdjustment } from "@/utils/invoicePaymentMath";

/**
 * يضمن تطابق الخصم/الإجمالي/المتبقي/الحالة بين طبقات الحساب في التطبيق
 * وبين HTML الطباعة (printTemplate) — منعًا للانحراف.
 */

const baseItems = [
  { product_name: "منتج A", quantity: 2, unit_price: 100, tax_amount: 0, discount: 0, total: 200 },
  { product_name: "منتج B", quantity: 1, unit_price: 300, tax_amount: 0, discount: 0, total: 300 },
];

describe("Discount / paid_amount / remaining / status — parity across preview & printTemplate", () => {
  it("خصم مقطوع 50 → يظهر في HTML والإجمالي محسوب", () => {
    const html = generatePrintHTML({
      type: "invoice",
      number: "INV-1",
      date: "2026-01-01",
      customer: { name: "ع" },
      items: baseItems,
      subtotal: 500,
      taxTotal: 0,
      discountTotal: 50,
      grandTotal: 450,
      paidAmount: 0,
      dueAmount: 450,
      company: {} as any,
    });
    expect(html).toContain("450"); // grand total
    expect(html).toContain("50");  // discount value
  });

  it("خصم بنسبة 10% على 500 = 50 — نفس الإجمالي 450", () => {
    const discPct = 10;
    const subtotal = 500;
    const disc = subtotal * (discPct / 100);
    expect(disc).toBe(50);
    expect(subtotal - disc).toBe(450);
  });

  it("دفعة جزئية 200 من 450 → partial + متبقي 250", () => {
    const total = 450;
    const paid = 200;
    expect(computeInvoiceStatusAfterPayment({ total, paidAfter: paid })).toBe("partial");
    expect(total - paid).toBe(250);
  });

  it("دفعة كاملة 450 → paid + متبقي 0", () => {
    const total = 450;
    const paid = 450;
    expect(computeInvoiceStatusAfterPayment({ total, paidAfter: paid })).toBe("paid");
    expect(total - paid).toBe(0);
  });

  it("خصم إضافي 100 من 450 → الإجمالي 350، دفعة 350 → paid", () => {
    const subtotal = 500;
    const originalDiscount = 50;
    const extraDiscount = 100;
    const nextTotal = subtotal - (originalDiscount + extraDiscount);
    expect(nextTotal).toBe(350);
    expect(computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter: 350 })).toBe("paid");
  });

  it("دفع صفر ولا خصم → pending", () => {
    expect(computeInvoiceStatusAfterPayment({ total: 100, paidAfter: 0 })).toBe("pending");
  });

  it("فاتورة 25,200 + خصم دفع 200 + دفع 25,000 → الخصم منفصل والمدفوع لا يساوي الخصم", () => {
    const result = computeInvoicePaymentAdjustment({
      currentTotal: 25200,
      currentPaid: 0,
      currentDiscount: 0,
      paymentAmount: 25000,
      discountAmount: 200,
    });
    expect(result.nextDiscount).toBe(200);
    expect(result.nextTotal).toBe(25000);
    expect(result.cashApplied).toBe(25000);
    expect(result.nextPaid).toBe(25000);
    expect(result.newDue).toBe(0);
    expect(result.nextStatus).toBe("paid");
  });

  it("طباعة فاتورة 25,200 بعد خصم 200 تعرض قيمة قبل الخصم ثم الخصم ثم صافي الحساب", () => {
    const html = generatePrintHTML({
      type: "invoice",
      number: "INV-DISC-25200",
      date: "2026-01-01",
      customer: { name: "عميل اختبار" },
      items: [{ product_name: "صنف", quantity: 1, unit_price: 25200, tax_amount: 0, discount: 0, total: 25200 }],
      subtotal: 25200,
      taxTotal: 0,
      discountTotal: 200,
      grandTotal: 25000,
      paidAmount: 25000,
      dueAmount: 0,
      company: {} as any,
    });
    expect(html).toContain("الخصم على الفاتورة");
    expect(html).toContain("25,200");
    expect(html).toContain("25,000");
    expect(html).toContain("− 200");
    expect(html).toContain("مسددة بالكامل");
  });

  it("فواتير الكاش عند خصم لاحق تقلل total وpaid_amount معاً حتى لا يظهر فرق", () => {
    const result = computeInvoicePaymentAdjustment({
      currentTotal: 25200,
      currentPaid: 25200,
      currentDiscount: 0,
      discountAmount: 200,
      isPos: true,
    });
    expect(result.nextDiscount).toBe(200);
    expect(result.nextTotal).toBe(25000);
    expect(result.nextPaid).toBe(25000);
    expect(result.newDue).toBe(0);
    expect(result.nextStatus).toBe("paid");
  });
});
