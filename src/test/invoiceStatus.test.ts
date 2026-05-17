import { describe, it, expect } from "vitest";
import {
  ALLOWED_INVOICE_STATUSES,
  computeInvoiceStatusAfterPayment,
  isAllowedInvoiceStatus,
} from "@/utils/invoiceStatus";

describe("invoiceStatus — حالة الفاتورة بعد الدفع", () => {
  describe("computeInvoiceStatusAfterPayment", () => {
    it("paid: المدفوع == الإجمالي", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 1000 })).toBe("paid");
    });

    it("paid: المدفوع > الإجمالي (دفع زائد)", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 1200 })).toBe("paid");
    });

    it("paid: ضمن هامش التسامح 0.01", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 999.995 })).toBe("paid");
      expect(computeInvoiceStatusAfterPayment({ total: 100.03, paidAfter: 100.02 })).toBe("paid");
    });

    it("partial: مدفوع جزئياً", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 500 })).toBe("partial");
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 0.5 })).toBe("partial");
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 999 })).toBe("partial");
    });

    it("pending: لم يُدفع شيء", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 0 })).toBe("pending");
    });

    it("pending: مبلغ تافه ضمن هامش التسامح (<= 0.01)", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 0.01 })).toBe("pending");
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: 0.005 })).toBe("pending");
    });

    it("pending: عند إجمالي صفر ولا توجد دفعات", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 0, paidAfter: 0 })).toBe("pending");
    });

    it("partial: عند إجمالي صفر لكن يوجد مبلغ مدفوع (لا يمكن أن يصبح paid لأن total<=0)", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 0, paidAfter: 50 })).toBe("partial");
    });

    it("يتعامل مع المدخلات غير الرقمية بأمان (NaN يصبح 0)", () => {
      expect(
        computeInvoiceStatusAfterPayment({
          total: Number("abc") as any,
          paidAfter: Number("xyz") as any,
        }),
      ).toBe("pending");
    });

    it("يتعامل مع القيم السالبة كأنها لا دفعة", () => {
      expect(computeInvoiceStatusAfterPayment({ total: 1000, paidAfter: -50 })).toBe("pending");
    });
  });

  describe("isAllowedInvoiceStatus — يطابق قيد قاعدة البيانات", () => {
    it("يقبل جميع الحالات الخمس المسموحة من القيد", () => {
      // يجب أن يطابق invoices_status_check تماماً
      const dbAllowed = ["paid", "partial", "pending", "overdue", "cancelled"];
      for (const s of dbAllowed) {
        expect(isAllowedInvoiceStatus(s)).toBe(true);
      }
    });

    it("القائمة المُصدَّرة ALLOWED_INVOICE_STATUSES تطابق قيد قاعدة البيانات", () => {
      expect([...ALLOWED_INVOICE_STATUSES].sort()).toEqual(
        ["paid", "partial", "pending", "overdue", "cancelled"].sort(),
      );
    });

    it("يرفض القيم الخاطئة المعروفة (regression: partially_paid)", () => {
      expect(isAllowedInvoiceStatus("partially_paid")).toBe(false);
      expect(isAllowedInvoiceStatus("PAID")).toBe(false);
      expect(isAllowedInvoiceStatus("done")).toBe(false);
      expect(isAllowedInvoiceStatus("")).toBe(false);
    });

    it("يرفض القيم غير النصية", () => {
      expect(isAllowedInvoiceStatus(null)).toBe(false);
      expect(isAllowedInvoiceStatus(undefined)).toBe(false);
      expect(isAllowedInvoiceStatus(0)).toBe(false);
      expect(isAllowedInvoiceStatus({})).toBe(false);
    });
  });

  describe("التكامل: كل ناتج computeInvoiceStatusAfterPayment يجب أن يجتاز قيد القاعدة", () => {
    const cases: Array<{ total: number; paidAfter: number; label: string }> = [
      { total: 1000, paidAfter: 0, label: "لا دفعات" },
      { total: 1000, paidAfter: 1, label: "دفعة صغيرة جداً" },
      { total: 1000, paidAfter: 500, label: "نصف المبلغ" },
      { total: 1000, paidAfter: 1000, label: "كامل المبلغ" },
      { total: 1000, paidAfter: 1500, label: "دفع زائد" },
      { total: 0, paidAfter: 0, label: "إجمالي صفر" },
      { total: 0.5, paidAfter: 0.5, label: "مبالغ صغيرة جداً" },
      { total: 99999.99, paidAfter: 99999.98, label: "هامش التسامح" },
    ];

    for (const c of cases) {
      it(`الحالة المحسوبة لـ "${c.label}" مقبولة من القيد`, () => {
        const st = computeInvoiceStatusAfterPayment({ total: c.total, paidAfter: c.paidAfter });
        expect(isAllowedInvoiceStatus(st)).toBe(true);
      });
    }
  });

  describe("سيناريو حفظ الدفعة من InvoiceCreatePage.handleRecordPayment", () => {
    // يحاكي: newPaid = savedPaid + amount
    function simulate(savedPaid: number, amount: number, savedTotal: number) {
      const newPaid = (Number(savedPaid) || 0) + amount;
      const st = computeInvoiceStatusAfterPayment({ total: savedTotal, paidAfter: newPaid });
      return { newPaid, st, allowed: isAllowedInvoiceStatus(st) };
    }

    it("دفعة أولى جزئية → partial، مقبولة", () => {
      const r = simulate(0, 300, 1000);
      expect(r.st).toBe("partial");
      expect(r.allowed).toBe(true);
    });

    it("دفعة ثانية تكمل المبلغ → paid، مقبولة", () => {
      const r = simulate(300, 700, 1000);
      expect(r.st).toBe("paid");
      expect(r.allowed).toBe(true);
    });

    it("دفعة بصفر على فاتورة جديدة → pending، مقبولة", () => {
      const r = simulate(0, 0, 1000);
      expect(r.st).toBe("pending");
      expect(r.allowed).toBe(true);
    });

    it("دفعة بفلس → pending، مقبولة (تحت هامش التسامح)", () => {
      const r = simulate(0, 0.005, 1000);
      expect(r.st).toBe("pending");
      expect(r.allowed).toBe(true);
    });

    it("دفعة دقيقة تصل إلى حافة paid (هامش 0.01) → paid، مقبولة", () => {
      const r = simulate(0, 999.99, 1000);
      expect(r.st).toBe("paid");
      expect(r.allowed).toBe(true);
    });

    it("دفعة زائدة على فاتورة كانت مدفوعة جزئياً → paid، مقبولة", () => {
      const r = simulate(800, 500, 1000);
      expect(r.st).toBe("paid");
      expect(r.allowed).toBe(true);
    });
  });
});
