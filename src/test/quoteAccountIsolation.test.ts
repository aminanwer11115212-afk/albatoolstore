/**
 * البند 3 — عرض السعر لا يدخل حساب العميل.
 *
 * كان ملخّص الحساب واحداً للفاتورة وعرض السعر: يُجمع إجمالي العرض على الرصيد
 * السابق ويُعرض الناتج «رصيد العميل الحالي». فيقرأ العميل في ورقة العرض أن
 * عرضاً لم يُقبل بعد قد صار ديناً عليه — والعرض ليس مطالبةً أصلاً: لا يُكتب في
 * كشف الحساب، ولا يمسّ `customers.balance`، ولا يُبنى منه قيد.
 */
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";

const items = [{ product_name: "بطارية", quantity: 10, unit_price: 40_000, tax_amount: 0, discount: 0, total: 400_000 }];

const doc = (type: "invoice" | "quote", extra: Record<string, any> = {}) => generatePrintHTML({
  type,
  number: type === "quote" ? "QT-1001" : "INV-23360",
  date: "2026-08-02",
  customer: { name: "عميل تجريبي", phone: "0909605576" },
  items,
  subtotal: 400_000,
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 400_000,
  company: null,
  // العميل عليه 300,000 قبل هذا المستند
  previousDebt: 300_000,
  previousCredit: 0,
  ...extra,
} as any);

describe("ورقة عرض السعر", () => {
  const html = doc("quote");

  it("لا تجمع إجمالي العرض على رصيد العميل", () => {
    // 400,000 + 300,000 = 700,000 كان يظهر «جملة الحساب»
    expect(html).not.toContain("700,000");
    expect(html).toContain("إجمالي عرض السعر");
    expect(html).not.toContain("جملة الحساب");
  });

  it("لا صفَّ «المدفوع» — العرض لا يُدفع", () => {
    expect(html).not.toContain("المدفوع");
  });

  it("لا صفَّ «الحساب القديم» — حساب العميل ليس جزءاً من العرض", () => {
    expect(html).not.toContain("الحساب القديم");
  });

  it("رصيد العميل يُعرض كما هو قبل العرض — لا يزيد به", () => {
    expect(html).toContain("رصيد العميل الحالي");
    expect(html).toContain("300,000");
  });

  it("عميل بلا رصيد سابق: لا صفَّ رصيدٍ أصلاً", () => {
    const clean = doc("quote", { previousDebt: 0, previousCredit: 0 });
    expect(clean).not.toContain("رصيد العميل الحالي");
    expect(clean).toContain("إجمالي عرض السعر");
  });

  it("أرقام العرض نفسها سليمة", () => {
    expect(html).toContain("قيمة عرض السعر");
    expect(html).toContain("400,000");
    expect(html).toContain("QT-1001");
  });
});

describe("ورقة الفاتورة لم تتغيّر", () => {
  const html = doc("invoice", { paidAmount: 100_000, currentNet: 600_000 });

  it("تجمع الفاتورة على الحساب القديم كما كانت", () => {
    expect(html).toContain("جملة الحساب");
    expect(html).toContain("700,000");
    expect(html).toContain("الحساب القديم");
    expect(html).toContain("المدفوع");
  });

  it("«قيمة الفاتورة» لا «قيمة عرض السعر»", () => {
    expect(html).toContain("قيمة الفاتورة");
    expect(html).not.toContain("قيمة عرض السعر");
  });
});

describe("عرض السعر لا يُبنى منه قيدٌ في كشف الحساب", () => {
  it("باني الكشف لا يقرأ جدول العروض أصلاً", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
    for (const f of ["src/utils/buildCustomerLedger.ts", "src/utils/buildCustomerAccountView.ts"]) {
      const src = read(f);
      expect(src).not.toMatch(/from\(["']quotes["']\)/);
      expect(src).not.toMatch(/from\(["']quote_items["']\)/);
    }
  });
});
