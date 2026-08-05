/**
 * كتالوج المنتجات: زرّ المشاركة يشارك، وخطّه يُقرأ. وبحثُ العميل «يبدأ بـ».
 *
 * ## ما بلّغ عنه صاحب المستودع
 *   • «صفحة كتالوج PDF: الزرّ بتاع المشاركة دا مفروض يشارك، **هو بفتح زي
 *     المعاينة عادي**. وظبّط معاك حجم الخطّ، لازم يكون كبير وواضح في الـPDF».
 *   • «بحث اسم العميل في الفاتورة: لمّا تكتب الاسم يجيك طوالي، **ما يديك ما
 *     يحتوي على الحرف**».
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leadsWithAny, startsWithAny } from "@/utils/searchMatch";
import { MIN_FONT_PX } from "@/utils/printDensity";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const PRODUCTS = read("src/pages/ProductsPage.tsx");

/* ─────────── ١) المشاركة تشارك ─────────── */

/**
 * كان الزرّ يفتح نافذةً تُحمّل `html2pdf` من CDN خارجي ثم تشارك وتُغلق نفسها.
 * فحين يُحجب الـCDN — بسياسة شبكةٍ أو انقطاع — يسقط السكربت **بصمت**، فتبقى
 * النافذة مفتوحةً على الكتالوج كأنها معاينة. وهو ما وصفه صاحب المستودع
 * حرفاً: «هو بفتح زي المعاينة عادي».
 */
describe("المشاركة تُبنى داخل التطبيق لا من شبكةٍ خارجية", () => {
  it("لا سكربتَ PDF من CDN في صفحة المنتجات", () => {
    expect(PRODUCTS).not.toContain("cdnjs.cloudflare.com");
  });

  it("والمكتبة تُستورَد من الحزمة كسولاً — وهي موجودةٌ فيها أصلاً", () => {
    expect(PRODUCTS).toContain('await import("html2pdf.js")');
  });

  it("والمشاركة تُجرَّب ثم يُنزَّل الملف إن لم تُدعَم — لا طريقَ مسدود", () => {
    const block = PRODUCTS.slice(PRODUCTS.indexOf('if (mode === "share")'), PRODUCTS.indexOf("const w = window.open"));
    expect(block).toContain("canShare");
    expect(block).toContain("a.download = CATALOG_PDF_NAME");
  });

  it("ولا تعتمد على نافذةٍ منبثقة قد يحجبها المتصفّح", () => {
    const block = PRODUCTS.slice(PRODUCTS.indexOf('if (mode === "share")'), PRODUCTS.indexOf("const w = window.open"));
    expect(block).not.toContain("window.open");
  });

  it("والصور تُنتظر قبل التصوير — صورةٌ لم تُحمَّل تُصوَّر فارغة", () => {
    const block = PRODUCTS.slice(PRODUCTS.indexOf('if (mode === "share")'), PRODUCTS.indexOf("const w = window.open"));
    expect(block).toContain("img.complete");
  });

  it("والحاوية خارج الشاشة لا مخفيّة — المخفيّ يُقاس صفراً فيخرج فارغاً", () => {
    const block = PRODUCTS.slice(PRODUCTS.indexOf('if (mode === "share")'), PRODUCTS.indexOf("const w = window.open"));
    expect(block).toContain("left:-10000px");
    // النصّ المفحوص هو سطر التنسيق نفسه لا التعليق الذي يشرحه
    const styleLine = /host\.style\.cssText = "([^"]*)"/.exec(block)?.[1] || "";
    expect(styleLine).toBeTruthy();
    expect(styleLine).not.toContain("display:none");
    expect(styleLine).not.toContain("visibility:hidden");
  });

  it("واسم الملف من مصدرٍ واحد لا ثلاث نسخٍ نصّية", () => {
    expect(PRODUCTS).toContain('const CATALOG_PDF_NAME = "كتالوج-المنتجات.pdf"');
    // النسخ النصّية الثلاث القديمة اختفت
    expect((PRODUCTS.match(/'كتالوج-المنتجات\.pdf'/g) || []).length).toBe(0);
  });

  it("والمعاينة والطباعة تبقيان في نافذةٍ كما كانتا", () => {
    expect(PRODUCTS).toContain('const w = window.open("", "_blank")');
    expect(PRODUCTS).toContain('mode === "print"');
  });
});

/* ─────────── ٢) الخطّ كبيرٌ وواضح ─────────── */

describe("خطّ الكتالوج يُقرأ مطبوعاً", () => {
  /** مقاسات الخطّ كما هي مكتوبةٌ في بانية الكتالوج. */
  const sizes = (() => {
    const at = PRODUCTS.indexOf("const rowFontPx =");
    const block = PRODUCTS.slice(at, PRODUCTS.indexOf("const priceFmt", at));
    return Array.from(block.matchAll(/\?\s*(\d+)\s*:|:\s*(\d+)\s*\)/g))
      .map((m) => Number(m[1] ?? m[2]))
      .filter((n) => Number.isFinite(n) && n > 0);
  })();

  it("المقاسات موجودةٌ فعلاً — فحصٌ لا يُفرَّغ", () => {
    expect(sizes.length).toBeGreaterThanOrEqual(4);
  });

  it("ولا مقاسَ تحت أرضية القراءة", () => {
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it("وأصغرها أكبر ممّا كان — كان ينزل إلى 11px", () => {
    expect(Math.min(...sizes)).toBeGreaterThan(11);
  });

  it("والأرضية واحدةٌ في النظام: الكتالوج يستوردها لا يكتبها", () => {
    expect(PRODUCTS).toContain('from "@/utils/printDensity"');
    expect(PRODUCTS).toContain("Math.max(MIN_FONT_PX,");
  });

  it("وترويسة الجدول تتبع المقاس لا رقماً ثابتاً", () => {
    expect(PRODUCTS).toContain("const headFontPx =");
    expect(PRODUCTS).toContain("font-size: ${headFontPx}px");
  });
});

/* ─────────── ٣) بحث اسم العميل «يبدأ بـ» ─────────── */

describe("اسم العميل يُطابَق من أوّله", () => {
  const CUSTOMERS = ["محمد أحمد", "أحمد علي", "استرا للتجارة", "بوري است"];
  const match = (q: string) => CUSTOMERS.filter((c) => leadsWithAny([c], q));

  it("«أح» تُظهر من يبدأ بها وحده", () => {
    expect(match("أح")).toEqual(["أحمد علي"]);
  });

  it("و«است» لا تُظهر «بوري است» — وهذا هو المشتكى منه", () => {
    expect(match("است")).toEqual(["استرا للتجارة"]);
  });

  it("والقاعدة القديمة كانت تُظهرهما — للمقارنة", () => {
    expect(CUSTOMERS.filter((c) => startsWithAny([c], "است"))).toHaveLength(2);
  });

  it("والتطبيع العربي باقٍ: «احمد» تجد «أحمد»", () => {
    expect(match("احمد")).toEqual(["أحمد علي"]);
  });

  it("وبحثٌ فارغ لا يُرشِّح", () => {
    expect(match("")).toHaveLength(CUSTOMERS.length);
  });
});

describe("والشاشات الثلاث على القاعدة نفسها", () => {
  const SCREENS = [
    "src/screens/InvoiceCreateScreen.tsx",
    "src/pages/QuoteCreatePage.tsx",
    "src/pages/StockReturnCreatePage.tsx",
  ];

  it.each(SCREENS)("%s تُطابق من أوّل الاسم", (file) => {
    expect(read(file)).toContain("leadsWithAny([c.name, c.phone], customerSearch)");
  });

  it.each(SCREENS)("%s لم يبقَ فيها المطابقة بأوّل كلمةٍ للعميل", (file) => {
    expect(read(file)).not.toContain("startsWithAny([c.name, c.phone], customerSearch)");
  });

  it("وهي القاعدة نفسها المطبَّقة في بحث المنتجات — سلوكٌ واحد في الشاشة", () => {
    expect(read("src/utils/productMatches.ts")).toContain("leadsWithAny");
  });
});
