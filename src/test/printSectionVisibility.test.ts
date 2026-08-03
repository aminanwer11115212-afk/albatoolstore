/**
 * رؤية التواقيع ومعلومات الترحيل وتفاصيل التغليف.
 *
 * ## أين يُتحكَّم بها
 * في **«تخصيص الرؤية» بشريط المعاينة وحده** — لا أزرار لها في شاشة إدخال
 * الفاتورة أو عرض السعر. شريط المعاينة يبني أزراره تلقائياً من كل عنصر يحمل
 * `data-section`، فيكفي أن يحمله القسم ليصير قابلاً للإخفاء. وهذا ما تفحصه
 * أوّل مجموعة هنا: **التواقيع لم تكن تحمله أصلاً** فلم يكن لها زرّ.
 *
 * ## ولماذا يبقى `hiddenSections` في القالب
 * ما يُخفى في المعاينة يُنقل إلى رابط العميل عند المشاركة، فيُحذف هناك من
 * الـHTML نفسه لا بالتنسيق — ورقةٌ تخرج إلى العميل لا شريط أدوات فيها يُخفي.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "@/utils/printTemplate";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const base = {
  type: "invoice" as const,
  number: "INV-23360",
  date: "2026-08-02",
  customer: { name: "عميل تجريبي", phone: "0909605576" },
  items: [{ product_name: "بطارية", quantity: 10, unit_price: 40_000, tax_amount: 0, discount: 0, total: 400_000 }],
  subtotal: 400_000,
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 400_000,
  paidAmount: 100_000,
  company: null,
};

const OPTIONAL_SECTIONS: Array<[string, string]> = [
  ["signatures", "التواقيع"],
  ["packaging", "تفاصيل التغليف"],
  ["transport", "معلومات الترحيل"],
];

describe("الأقسام الثلاثة تظهر افتراضاً وتُخصَّص رؤيتها من المعاينة", () => {
  const html = generatePrintHTML({ ...base });

  it("التواقيع مرسومة", () => {
    expect(html).toContain("توقيع المستلم");
    expect(html).toContain("توقيع المسؤول");
  });

  it("صندوقا التغليف والترحيل مرسومان", () => {
    expect(html).toContain("تفاصيل التغليف");
    expect(html).toContain("معلومات الترحيل");
  });

  it.each(OPTIONAL_SECTIONS)("القسم %s يحمل `data-section` — فيبنى له زرّ في «تخصيص الرؤية»", (key) => {
    expect(html).toContain(`data-section="${key}"`);
  });

  it.each(OPTIONAL_SECTIONS)("والقسم %s يحمل عنواناً عربياً يظهر على الزرّ: %s", (key, label) => {
    expect(html).toContain(`data-section="${key}" data-section-label="${label}"`);
  });

  it("شريط المعاينة يبني أزراره من `data-section` — فلا قائمة يدوية تُنسى", () => {
    const src = read("src/utils/printTemplate.ts");
    expect(src).toContain("document.querySelectorAll('[data-section]')");
    expect(src).toContain("__lov_visibility_row");
  });

  it("الإخفاء في المعاينة يحذف العنصر قبل توليد الـPDF — فلا يصل العميل مخفيّاً", () => {
    const src = read("src/utils/printTemplate.ts");
    expect(src).toContain("clone.querySelectorAll('.__lov_hidden').forEach");
  });
});

describe("لا أزرار رؤية في شاشتَي الإدخال — مكانها المعاينة وحدها", () => {
  it.each([
    "src/screens/InvoiceCreateScreen.tsx",
    "src/pages/QuoteCreatePage.tsx",
  ])("%s", (file) => {
    const src = read(file);
    expect(src).not.toContain("printSectionPrefs");
    expect(src).not.toContain("PRINT_SECTION_LABELS");
  });
});

describe("`hiddenSections` يحذف القسم من الورقة — لا يخفيه بالتنسيق", () => {
  it("التواقيع", () => {
    const html = generatePrintHTML({ ...base, hiddenSections: ["signatures"] });
    expect(html).not.toContain("توقيع المستلم");
    expect(html).not.toContain('data-section="signatures"');
    expect(html).toContain("تفاصيل التغليف");
  });

  it("معلومات الترحيل وحدها — والتغليف يبقى", () => {
    const html = generatePrintHTML({ ...base, hiddenSections: ["transport"] });
    expect(html).not.toContain("معلومات الترحيل");
    expect(html).toContain("تفاصيل التغليف");
  });

  it("إخفاؤهما معاً يُسقط الصفّ كلّه فلا يبقى إطارٌ فارغ", () => {
    const html = generatePrintHTML({ ...base, hiddenSections: ["transport", "packaging"] });
    expect(html).not.toContain('<div class="extra-row">');
    expect(html).toContain("توقيع المستلم");
  });

  it("الثلاثة معاً — والورقة نفسها سليمة", () => {
    const html = generatePrintHTML({ ...base, hiddenSections: ["signatures", "transport", "packaging"] });
    for (const s of ["توقيع المستلم", "معلومات الترحيل", "تفاصيل التغليف"]) {
      expect(html).not.toContain(s);
    }
    expect(html).toContain("بطارية");
    expect(html).toContain("INV-23360");
  });
});

describe("تفاصيل التغليف والترحيل تُطبع حين تُمرَّر", () => {
  const html = generatePrintHTML({
    ...base,
    packagingInfo: "النوع: كرتونة | الكمية: 10",
    transportInfo: "الاسم: مرحّل تجريبي | الهاتف: 0912345678",
  });

  it("المحتوى يظهر بدل جملة «لا توجد بيانات»", () => {
    expect(html).toContain("النوع: كرتونة");
    expect(html).toContain("مرحّل تجريبي");
    expect(html).not.toContain("لا توجد بيانات تغليف");
  });

  it("وشاشتا الإدخال تمرّرانها — كانتا لا تمرّرانها أصلاً", () => {
    expect(read("src/screens/InvoiceCreateScreen.tsx")).toContain("...printExtras,");
    expect(read("src/pages/QuoteCreatePage.tsx")).toContain("await loadQuoteExtras(editId)");
  });
});

describe("جملة «لا توجد بيانات» تتبع نوع المستند", () => {
  it("عرض السعر لا يقول «الفاتورة»", () => {
    const html = generatePrintHTML({ ...base, type: "quote" });
    expect(html).toContain("لا توجد بيانات تغليف لعرض السعر هذا");
    expect(html).not.toContain("لا توجد بيانات تغليف لهذه الفاتورة");
  });

  it("الفاتورة بصيغةٍ سليمة — كان مكتوباً «لهذا الفاتورة»", () => {
    const html = generatePrintHTML({ ...base });
    expect(html).toContain("لا توجد بيانات ترحيل لهذه الفاتورة");
    expect(html).not.toContain("لهذا الفاتورة");
  });
});

describe("كشف الجرد لا تواقيع فيه ولا صناديق تغليف", () => {
  it("الصيغة نفسها تمنعها", () => {
    const html = generatePrintHTML({ ...base, variant: "stocktake" });
    expect(html).not.toContain("توقيع المستلم");
    expect(html).not.toContain('<div class="extra-row">');
  });
});
