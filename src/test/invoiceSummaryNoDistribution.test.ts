// ملخّص الحساب في الفاتورة لا يقرأ توزيع الدفعة.
//
// حالة العميل: فاتورة 500,000 وحسابٌ قديمٌ 200,000، دفع 600,000.
// النظام يفتّت الدفعة داخلياً — 500,000 على الفاتورة و100,000 على الدَّين
// القديم — فكان الصندوق يعرض «المدفوع 500,000» و«القديم 100,000»، ولا يقفل:
//     700,000 − 500,000 = 200,000 ≠ المستحق فعلاً 100,000
//
// الرصيد الحالي حقيقةٌ مستقلّة عن كيفية التفتيت، فمنه يُشتقّ «المدفوع».
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";

const base = {
  type: "invoice" as const,
  number: "INV-500",
  date: "2026-08-01",
  customer: { name: "عميل", phone: "0100", address: "شارع" },
  items: [{ product_name: "بند", quantity: 1, unit_price: 500_000, tax_amount: 0, discount: 0, total: 500_000 }],
  subtotal: 500_000,
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 500_000,
  company: { company_name: "شركة" },
};

/** نصّ خليّة قسم بعينه من ملخّص الحساب. */
function cell(html: string, section: string): string {
  const m = html.match(
    new RegExp(`data-section="${section}"[\\s\\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)<`),
  );
  if (!m) throw new Error(`missing: ${section}`);
  return m[1].trim();
}

describe("ملخّص الحساب لا يقرأ توزيع الدفعة", () => {
  // العميل عليه 100,000 بعد كل شيء — هذه هي الحقيقة المستقلّة
  const html = generatePrintHTML({
    ...base,
    previousDebt: 200_000,
    previousCredit: 0,
    paidAmount: 500_000, // ما وُزِّع على هذه الفاتورة وحدها
    currentNet: 100_000, // الرصيد الفعلي: عليه 100,000
  });

  it("«الحساب القديم» يبقى كاملاً — لا منقوصاً بما وُزِّع عليه", () => {
    expect(cell(html, "prev-account-row")).toBe("−200,000");
  });

  it("«جملة الحساب» = الفاتورة + القديم", () => {
    expect(cell(html, "majmoo-row")).toBe("700,000");
  });

  it("«المدفوع» يعرض ما دفعه العميل كاملاً لا حصّة الفاتورة", () => {
    expect(cell(html, "paid-amount")).toBe("600,000");
  });

  it("«رصيد العميل الحالي» هو المستحق فعلاً بالسالب الأحمر", () => {
    expect(cell(html, "final-total")).toBe("−100,000");
    expect(html).toMatch(/data-section="final-total"[^>]*color:#c0392b/);
  });

  it("الصندوق يقفل: جملة الحساب − المدفوع = الرصيد الحالي", () => {
    const n = (s: string) => Number(s.replace(/[^\d.-]/g, ""));
    expect(n(cell(html, "majmoo-row")) - n(cell(html, "paid-amount"))).toBe(
      Math.abs(n(cell(html, "final-total"))),
    );
  });

  it("الفائض يظهر موجباً أخضر للعميل", () => {
    const over = generatePrintHTML({
      ...base, previousDebt: 200_000, paidAmount: 500_000, currentNet: -50_000,
    });
    expect(cell(over, "final-total")).toBe("+50,000");
    expect(cell(over, "paid-amount")).toBe("750,000");
  });

  it("بلا رصيد ممرَّر يبقى السلوك القديم — فاتورة الكاش بلا عميل", () => {
    const cash = generatePrintHTML({ ...base, paidAmount: 300_000 });
    expect(cell(cash, "paid-amount")).toBe("300,000");
    expect(cell(cash, "final-total")).toBe("−200,000");
  });
});
