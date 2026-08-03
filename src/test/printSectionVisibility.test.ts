/**
 * البندان 2 و 8 — رؤية التواقيع ومعلومات الترحيل وتفاصيل التغليف.
 *
 * ## لماذا الحذف من الـHTML لا الإخفاء بالتنسيق
 * شريط المعاينة يخفي الأقسام بـCSS، وذلك يكفي لمن ينظر إلى شاشته. لكن الورقة
 * تخرج إلى العميل من مساراتٍ لا تمرّ بذلك الشريط: PDF، والطباعة المباشرة،
 * والرابط العام. فلو بقي الإخفاء تنسيقاً لخرج التوقيعُ ومعلوماتُ المرحّل إلى
 * العميل رغم إخفائهما. لذا تُحذف عند التوليد — وهذا ما تفحصه هذه الاختبارات.
 */
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";
import {
  hiddenSectionKeys,
  DEFAULT_PRINT_SECTION_PREFS,
  PRINT_SECTION_LABELS,
} from "@/utils/printSectionPrefs";

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

describe("الافتراضي: الأقسام الثلاثة تظهر", () => {
  const html = generatePrintHTML({ ...base });

  it("التواقيع", () => {
    expect(html).toContain("توقيع المستلم");
    expect(html).toContain("توقيع المسؤول");
  });

  it("تفاصيل التغليف ومعلومات الترحيل", () => {
    expect(html).toContain("تفاصيل التغليف");
    expect(html).toContain("معلومات الترحيل");
  });

  it("كلٌّ منها قابل للإخفاء من شريط المعاينة — أي يحمل `data-section`", () => {
    for (const key of ["signatures", "packaging", "transport"]) {
      expect(html).toContain(`data-section="${key}"`);
    }
  });
});

describe("الإخفاء يحذف القسم من الورقة", () => {
  it("التواقيع", () => {
    const html = generatePrintHTML({ ...base, hiddenSections: ["signatures"] });
    expect(html).not.toContain("توقيع المستلم");
    expect(html).not.toContain("توقيع المسؤول");
    // ولا يُخفى بالتنسيق فيبقى في المصدر ويخرج في PDF
    expect(html).not.toContain('data-section="signatures"');
    // وما عداه باقٍ
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

  it("الثلاثة معاً", () => {
    const html = generatePrintHTML({ ...base, hiddenSections: ["signatures", "transport", "packaging"] });
    for (const s of ["توقيع المستلم", "معلومات الترحيل", "تفاصيل التغليف"]) {
      expect(html).not.toContain(s);
    }
    // الورقة نفسها سليمة: البنود والإجمالي في مكانهما
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

describe("hiddenSectionKeys — ترجمة التفضيل إلى ما يفهمه القالب", () => {
  it("الافتراضي: لا شيء مخفي", () => {
    expect(hiddenSectionKeys(DEFAULT_PRINT_SECTION_PREFS)).toEqual([]);
  });

  it("`false` تعني مخفي", () => {
    expect(hiddenSectionKeys({ signatures: false, transport: true, packaging: false }).sort())
      .toEqual(["packaging", "signatures"]);
  });

  it("لكل قسم اسمٌ عربي معروض على الزرّ", () => {
    expect(Object.keys(PRINT_SECTION_LABELS).sort()).toEqual(["packaging", "signatures", "transport"]);
    expect(PRINT_SECTION_LABELS.signatures).toBe("التواقيع");
  });
});

describe("كشف الجرد لا تواقيع فيه ولا صناديق تغليف", () => {
  it("لا يتأثّر بالتفضيل — الصيغة نفسها تمنعها", () => {
    const html = generatePrintHTML({ ...base, variant: "stocktake" });
    expect(html).not.toContain("توقيع المستلم");
    expect(html).not.toContain('<div class="extra-row">');
  });
});
