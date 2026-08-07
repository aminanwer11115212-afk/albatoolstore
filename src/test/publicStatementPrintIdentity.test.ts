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

/**
 * يحذف كتل `@media` فتبقى القواعد الأساسية وحدها — وهي التي تُقارَن بهوية
 * قالب الطباعة؛ تجاوزات الشاشات الصغيرة تُفحَص في قسم منفصل أدناه.
 */
function withoutMediaBlocks(src: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const at = src.indexOf("@media", i);
    if (at === -1) { out += src.slice(i); break; }
    out += src.slice(i, at);
    // تجاوز الكتلة بموازنة الأقواس
    let depth = 0;
    let j = src.indexOf("{", at);
    if (j === -1) { i = at + 6; continue; }
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (depth === 0) { j++; break; } }
    }
    i = j;
  }
  return out;
}

const printBase = withoutMediaBlocks(printHtml);
const pageBase = withoutMediaBlocks(pageSrc);

describe("الترويسة وعنوان المستند — نفس القيم", () => {
  it.each([
    [".header", ".ps-header", "border-bottom", "3px solid #4a7c59"],
    [".header-title", ".ps-header-title", "color", "#c0392b"],
    [".header-title", ".ps-header-title", "font-size", "22px"],
  ])("%s ↔ %s / %s", (printSel, pageSel, prop, expected) => {
    expect(cssProp(printBase, printSel, prop)).toBe(expected);
    expect(cssProp(pageBase, pageSel, prop)).toBe(expected);
  });

  it("عنوان المستند بنفس اللون والحد السفلي", () => {
    expect(cssProp(printBase, ".doc-title h1", "color")).toBe("#2c3e50");
    expect(cssProp(pageBase, ".ps-doc-title h1", "color")).toBe("#2c3e50");
    expect(cssProp(printBase, ".doc-title h1", "border-bottom")).toBe("3px solid #5b2c8e");
    expect(cssProp(pageBase, ".ps-doc-title h1", "border-bottom")).toBe("3px solid #5b2c8e");
  });
});

describe("الجداول — نفس هوية قالب الطباعة", () => {
  it("رأس الجدول بنفس الخلفية واللون والحد", () => {
    expect(cssProp(printBase, "thead th", "background")).toBe("#5b4cad");
    expect(cssProp(pageBase, ".ps-table thead th", "background")).toBe("#5b4cad");
    expect(cssProp(pageBase, ".ps-table thead th", "border")).toBe("1px solid #1a1a1a");
  });

  it("خلايا الجدول بنفس الحشو والحجم والحد", () => {
    expect(cssProp(pageBase, ".ps-table tbody td", "padding")).toBe(cssProp(printBase, "tbody td", "padding"));
    expect(cssProp(pageBase, ".ps-table tbody td", "font-size")).toBe(cssProp(printBase, "tbody td", "font-size"));
    expect(cssProp(pageBase, ".ps-table tbody td", "border")).toBe(cssProp(printBase, "tbody td", "border"));
  });

  it("إطار الجدول 2px أسود كقالب الطباعة", () => {
    expect(cssProp(printBase, "table", "border")).toBe("2px solid #1a1a1a");
    expect(cssProp(pageBase, ".ps-table", "border")).toBe("2px solid #1a1a1a");
  });

  // الجدول المسطّح له سطر مجاميع واحد (.ps-closing-row) بدل سطرين.
  it("سطر المجموع محاط بنفس حدّ .total-row في قالب الفاتورة", () => {
    expect(cssProp(printBase, ".total-row td", "background")).toBe("#f0f0f0");
    expect(cssProp(pageBase, ".ps-by-invoice .ps-closing-row td", "border")).toBe("2px solid #1a1a1a");
    expect(cssProp(pageBase, ".ps-by-invoice .ps-closing-row td", "background")).toBe("#e8eef7");
  });
});

describe("صناديق الملخّص — نفس المقاسات والألوان", () => {
  it("المسافة والحشو ومقاس العنوان مطابقة", () => {
    expect(cssProp(printBase, ".summary-row", "gap")).toBe("30px");
    expect(cssProp(pageBase, ".ps-summary-row", "gap")).toBe("30px");
    expect(cssProp(printBase, ".summary-box", "padding")).toBe("12px 30px");
    expect(cssProp(pageBase, ".ps-summary-box", "padding")).toBe("12px 30px");
    expect(cssProp(printBase, ".summary-box-title", "font-size")).toBe("15px");
    expect(cssProp(pageBase, ".ps-summary-box-title", "font-size")).toBe("15px");
  });

  it("الإطار أسود دائماً والقيمة وحدها ملوّنة — كقالب الطباعة", () => {
    expect(cssProp(printBase, ".summary-box", "border")).toBe("2px solid #1a1a1a");
    expect(cssProp(pageBase, ".ps-summary-box", "border")).toBe("2px solid #1a1a1a");
    // لم يعد الإطار يُلوَّن حسب الحالة
    expect(pageSrc).not.toContain(".ps-summary-box.blue { border-color");
    expect(pageSrc).not.toContain(".ps-summary-box.red { border-color");
    expect(cssProp(pageBase, ".ps-summary-box.blue .ps-summary-box-value", "color")).toBe("#2980b9");
    expect(cssProp(pageBase, ".ps-summary-box.red .ps-summary-box-value", "color")).toBe("#c0392b");
  });

  it("لا يتكسّر الصندوق على الشاشات الصغيرة", () => {
    expect(cssProp(pageBase, ".ps-summary-box", "min-width")).toBe("min(220px, 100%)");
    expect(cssProp(pageBase, ".ps-summary-row", "flex-wrap")).toBe("wrap");
  });

  it("لا يتمدّد الصندوق النازل وحده على سطر جديد — كقالب الطباعة", () => {
    // قالب الطباعة لا يعطي .summary-box أي flex-grow
    expect(cssProp(printBase, ".summary-box", "flex")).toBeNull();
    expect(cssProp(pageBase, ".ps-summary-box", "flex")).toBe("0 1 auto");
  });
});

describe("سلامة العرض على الشاشات الصغيرة", () => {
  it("كل جدول داخل حاوية تمرير أفقي — فالصفحة نفسها لا تمرّر أفقياً", () => {
    const tables = pageSrc.match(/<table className="ps-table/g) || [];
    const wrappers = pageSrc.match(/<div className="ps-table-scroll"><table className="ps-table/g) || [];
    expect(tables.length).toBeGreaterThan(0);
    expect(wrappers.length).toBe(tables.length);
    expect(cssProp(pageSrc, ".ps-table-scroll", "overflow-x")).toBe("auto");
  });

  it("عرض أدنى للجدول تحت 640px حتى لا تنكسر الكلمات حرفاً حرفاً", () => {
    const mq = pageSrc.slice(pageSrc.indexOf("@media (max-width: 640px)"));
    expect(mq).toContain(".ps-table { min-width: 560px; }");
    // جدول الفواتير 7 أعمدة يحتاج عرضاً أكبر
    expect(mq).toContain(".ps-table.ps-by-invoice { min-width: 780px; }");
  });

  it("الطباعة تُلغي التمرير والعرض الأدنى فيظهر الجدول كاملاً", () => {
    const printBlock = pageSrc.slice(pageSrc.indexOf("@media print"));
    expect(printBlock).toContain(".ps-table-scroll { overflow: visible !important; }");
    expect(printBlock).toContain(".ps-table { min-width: 0 !important; }");
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
    expect(cssProp(pageBase, ".ps-signatures", "padding")).toBe(cssProp(printBase, ".signatures", "padding"));
    expect(cssProp(pageBase, ".ps-sig-line", "border-top")).toBe(cssProp(printBase, ".sig-line", "border-top"));
    expect(cssProp(pageBase, ".ps-sig-line", "margin-top")).toBe(cssProp(printBase, ".sig-line", "margin-top"));
    expect(cssProp(pageBase, ".ps-sig-box", "width")).toBe(cssProp(printBase, ".sig-box", "width"));
  });
});

describe("الخط ومقاس الصفحة", () => {
  it("نفس عائلة الخط وحجمه الأساسي", () => {
    expect(cssProp(printBase, "body", "font-family")).toContain("Arial");
    expect(cssProp(pageBase, ".public-statement", "font-family")).toContain("Arial");
    expect(cssProp(pageBase, ".public-statement", "font-size")).toBe("14px");
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
