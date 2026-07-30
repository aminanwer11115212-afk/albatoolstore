/**
 * البند 5 — توحيد هوية كشف حساب العميل مع طباعة الفواتير/العروض.
 *
 * يقارن قيم الأنماط فعلياً بين `printTemplate.ts` (مصدر الهوية) وأنماط
 * `PublicCustomerStatementPage`، فلو غُيّر أحدهما وحده يسقط الاختبار.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "@/utils/printTemplate";

const printHtml = generatePrintHTML({
  type: "invoice",
  number: "INV-1",
  date: "2026-07-30",
  customer: { name: "أحمد" },
  items: [],
  subtotal: 0,
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 0,
  company: { company_name: "شركة" },
} as any);

const pageSrc = fs.readFileSync(
  path.resolve(process.cwd(), "src/pages/PublicCustomerStatementPage.tsx"),
  "utf8",
);

/**
 * يلتقط قيمة خاصية CSS داخل قاعدة محدّدة.
 *
 * المحدِّد نفسه قد يتكرّر (قاعدة أساسية + تجاوز داخل `@media print`)، فنمسح كل
 * القواعد ونُعيد آخر قيمة — وهي التي تسود فعلاً في المتصفّح.
 */
function cssProp(source: string, selector: string, prop: string): string | null {
  const needle = selector + " {";
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`);
  let from = 0;
  let value: string | null = null;
  for (;;) {
    const idx = source.indexOf(needle, from);
    if (idx === -1) break;
    // تأكّد أن ما قبل المحدِّد ليس جزءاً من محدِّد أطول (.header داخل .ps-header)
    const prev = idx > 0 ? source[idx - 1] : "\n";
    if (/[\w-]/.test(prev)) { from = idx + needle.length; continue; }
    const end = source.indexOf("}", idx);
    const m = source.slice(idx, end === -1 ? undefined : end).match(re);
    if (m) value = m[1].trim();
    from = idx + needle.length;
  }
  return value;
}

describe("الترويسة وعنوان المستند — نفس القيم", () => {
  it.each([
    [".header", ".ps-header", "border-bottom", "3px solid #4a7c59"],
    [".header-title", ".ps-header-title", "color", "#c0392b"],
    [".header-title", ".ps-header-title", "font-size", "22px"],
  ])("%s ↔ %s / %s", (printSel, pageSel, prop, expected) => {
    expect(cssProp(printHtml, printSel, prop)).toBe(expected);
    expect(cssProp(pageSrc, pageSel, prop)).toBe(expected);
  });

  it("عنوان المستند بنفس اللون والحد السفلي", () => {
    expect(cssProp(printHtml, ".doc-title h1", "color")).toBe("#2c3e50");
    expect(cssProp(pageSrc, ".ps-doc-title h1", "color")).toBe("#2c3e50");
    expect(cssProp(printHtml, ".doc-title h1", "border-bottom")).toBe("3px solid #5b2c8e");
    expect(cssProp(pageSrc, ".ps-doc-title h1", "border-bottom")).toBe("3px solid #5b2c8e");
  });
});

describe("الجداول — نفس هوية قالب الطباعة", () => {
  it("رأس الجدول بنفس الخلفية واللون والحد", () => {
    expect(cssProp(printHtml, "thead th", "background")).toBe("#5b4cad");
    expect(cssProp(pageSrc, ".ps-table thead th", "background")).toBe("#5b4cad");
    expect(cssProp(pageSrc, ".ps-table thead th", "border")).toBe("1px solid #1a1a1a");
  });

  it("خلايا الجدول بنفس الحشو والحجم والحد", () => {
    expect(cssProp(pageSrc, ".ps-table tbody td", "padding")).toBe(cssProp(printHtml, "tbody td", "padding"));
    expect(cssProp(pageSrc, ".ps-table tbody td", "font-size")).toBe(cssProp(printHtml, "tbody td", "font-size"));
    expect(cssProp(pageSrc, ".ps-table tbody td", "border")).toBe(cssProp(printHtml, "tbody td", "border"));
  });

  it("إطار الجدول 2px أسود كقالب الطباعة", () => {
    expect(cssProp(printHtml, "table", "border")).toBe("2px solid #1a1a1a");
    expect(cssProp(pageSrc, ".ps-table", "border")).toBe("2px solid #1a1a1a");
  });

  it("صف المجاميع بنفس خلفية وحد .total-row", () => {
    expect(cssProp(printHtml, ".total-row td", "background")).toBe("#f0f0f0");
    expect(cssProp(pageSrc, ".ps-by-invoice .ps-total-row td", "background")).toBe("#f0f0f0");
    expect(cssProp(pageSrc, ".ps-by-invoice .ps-total-row td", "border")).toBe("2px solid #1a1a1a");
  });
});

describe("صناديق الملخّص — نفس المقاسات والألوان", () => {
  it("المسافة والحشو ومقاس العنوان مطابقة", () => {
    expect(cssProp(printHtml, ".summary-row", "gap")).toBe("30px");
    expect(cssProp(pageSrc, ".ps-summary-row", "gap")).toBe("30px");
    expect(cssProp(printHtml, ".summary-box", "padding")).toBe("12px 30px");
    expect(cssProp(pageSrc, ".ps-summary-box", "padding")).toBe("12px 30px");
    expect(cssProp(printHtml, ".summary-box-title", "font-size")).toBe("15px");
    expect(cssProp(pageSrc, ".ps-summary-box-title", "font-size")).toBe("15px");
  });

  it("الإطار أسود دائماً والقيمة وحدها ملوّنة — كقالب الطباعة", () => {
    expect(cssProp(printHtml, ".summary-box", "border")).toBe("2px solid #1a1a1a");
    expect(cssProp(pageSrc, ".ps-summary-box", "border")).toBe("2px solid #1a1a1a");
    // لم يعد الإطار يُلوَّن حسب الحالة
    expect(pageSrc).not.toContain(".ps-summary-box.blue { border-color");
    expect(pageSrc).not.toContain(".ps-summary-box.red { border-color");
    expect(cssProp(pageSrc, ".ps-summary-box.blue .ps-summary-box-value", "color")).toBe("#2980b9");
    expect(cssProp(pageSrc, ".ps-summary-box.red .ps-summary-box-value", "color")).toBe("#c0392b");
  });

  it("لا يتكسّر الصندوق على الشاشات الصغيرة", () => {
    expect(cssProp(pageSrc, ".ps-summary-box", "min-width")).toBe("min(220px, 100%)");
    expect(cssProp(pageSrc, ".ps-summary-row", "flex-wrap")).toBe("wrap");
  });
});

describe("التواقيع — نفس كتلة قالب الطباعة", () => {
  it("قالب الفاتورة يحتوي التواقيع", () => {
    expect(printHtml).toContain("توقيع المستلم");
    expect(printHtml).toContain("توقيع المسؤول");
  });

  it("كشف الحساب صار يحتويها بنفس القيم", () => {
    expect(pageSrc).toContain("توقيع المستلم");
    expect(pageSrc).toContain("توقيع المسؤول");
    expect(cssProp(pageSrc, ".ps-signatures", "padding")).toBe(cssProp(printHtml, ".signatures", "padding"));
    expect(cssProp(pageSrc, ".ps-sig-line", "border-top")).toBe(cssProp(printHtml, ".sig-line", "border-top"));
    expect(cssProp(pageSrc, ".ps-sig-line", "margin-top")).toBe(cssProp(printHtml, ".sig-line", "margin-top"));
    expect(cssProp(pageSrc, ".ps-sig-box", "width")).toBe(cssProp(printHtml, ".sig-box", "width"));
  });
});

describe("الخط ومقاس الصفحة", () => {
  it("نفس عائلة الخط وحجمه الأساسي", () => {
    expect(cssProp(printHtml, "body", "font-family")).toContain("Segoe UI");
    expect(cssProp(pageSrc, ".public-statement", "font-family")).toContain("Segoe UI");
    expect(cssProp(pageSrc, ".public-statement", "font-size")).toBe("14px");
  });

  it("نفس عرض الصفحة على الشاشة 800px، ويتمدّد عند الطباعة في الاثنين", () => {
    // القاعدتان تُعلَنان بترتيب مختلف بين الملفين (قاعدة أساسية + تجاوز
    // داخل @media print)، فنقارن مجموعة القيم لا ترتيبها.
    const allValues = (src: string, sel: string) => {
      const needle = sel + " {";
      const out: string[] = [];
      let from = 0;
      for (;;) {
        const idx = src.indexOf(needle, from);
        if (idx === -1) break;
        const prev = idx > 0 ? src[idx - 1] : "\n";
        if (!/[\w-]/.test(prev)) {
          const m = src.slice(idx, src.indexOf("}", idx)).match(/max-width\s*:\s*([^;}]+)/);
          if (m) out.push(m[1].trim());
        }
        from = idx + needle.length;
      }
      return out;
    };
    // نفس العرض على الشاشة
    expect(allValues(printHtml, ".page")).toContain("800px");
    expect(allValues(pageSrc, ".ps-page")).toContain("800px");
    // ويتمدّد الاثنان لملء الورقة عند الطباعة
    expect(allValues(printHtml, ".page").some((v) => /none|100%/.test(v))).toBe(true);
    expect(allValues(pageSrc, ".ps-page").some((v) => /none|100%/.test(v))).toBe(true);
  });
});
