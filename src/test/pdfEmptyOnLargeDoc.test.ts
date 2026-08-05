/**
 * الـPDF يخرج فارغاً في المستند الكبير — دقّةُ التصوير تُشتقّ من الحجم.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «راجعهم لمّا تبقى فاتورة كبيرة، الـPDF بمشي فاضي».
 *
 * ## والسبب في الرسم لا في الورقة
 * `html2pdf` يصوّر الورقة كلّها في **لوحة رسمٍ واحدة** ثم يقصّها صفحات. وللّوحة
 * سقفٌ في المتصفّح — طولُ ضلعٍ ومساحة — وفوقه **لا يرمي المتصفّح خطأً بل
 * يُعيد لوحةً فارغة**. فيخرج الملف أبيض بلا رسالةٍ تدلّ.
 *
 * وكانت الدقّة رقماً ثابتاً `scale: 2` في تسعة مواضع. فاتورةُ عشرة بنود
 * تُصوَّر في 1588×2245 — لا شيء. ومئةُ بندٍ تصير 1588×22450 = 35 مليون بكسل،
 * وسقفُ الهاتف دونها.
 *
 * ## ما يفحصه هذا الملفّ
 * أنّ الدقّة صارت مشتقّة، وأنّ **كل مخرج PDF** يستعملها — فالعطل يعود بأوّل
 * موضعٍ يُنسى، وهي تسعة.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  pdfCanvasScale, pdfScaleForElement,
  MAX_CANVAS_SIDE, MAX_CANVAS_AREA, MIN_SCALE, MAX_SCALE,
  PDF_SCALE_INLINE_JS,
} from "@/utils/pdfCanvasScale";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** عرض ورقة A4 بالبكسل، وارتفاع صفحةٍ واحدة تقريباً. */
const A4_W = 794;
const A4_H = 1123;

/* ─────────── ١) الدقّة تبقى تحت السقف ─────────── */

describe("الدقّة مشتقّة من حجم الورقة", () => {
  it("ورقةٌ واحدة تُصوَّر بأعلى دقّة — لا تنازل بلا سبب", () => {
    expect(pdfCanvasScale(A4_W, A4_H)).toBe(MAX_SCALE);
  });

  it("وصفحتان كذلك", () => {
    expect(pdfCanvasScale(A4_W, A4_H * 2)).toBe(MAX_SCALE);
  });

  it("وخمسُ صفحاتٍ تنزل قليلاً — لا كثيراً", () => {
    const s = pdfCanvasScale(A4_W, A4_H * 5);
    expect(s).toBeLessThan(MAX_SCALE);
    expect(s).toBeGreaterThan(1.5);
  });

  it("والدقّة لا تزيد مع طول الورقة أبداً — تناقصٌ مطّرد", () => {
    const at = (n: number) => pdfCanvasScale(A4_W, A4_H * n);
    for (const [a, b] of [[1, 5], [5, 10], [10, 20], [20, 50]]) {
      expect(at(b)).toBeLessThanOrEqual(at(a));
    }
  });

  it("وعشرون صفحةً تنزل بقدر الحاجة لا أكثر", () => {
    const s = pdfCanvasScale(A4_W, A4_H * 20);
    expect(s).toBeLessThan(MAX_SCALE);
    expect(s).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it("ومهما طالت لا تنزل تحت أرضية القراءة", () => {
    expect(pdfCanvasScale(A4_W, A4_H * 500)).toBe(MIN_SCALE);
  });
});

describe("والناتج يبقى داخل سقف لوحة الرسم", () => {
  const pages = [1, 2, 5, 10, 20, 40, 80];

  it.each(pages)("%s صفحة: المساحة تحت السقف", (n) => {
    const h = A4_H * n;
    const s = pdfCanvasScale(A4_W, h);
    const area = A4_W * s * h * s;
    // الاستثناء الوحيد ما تفرضه أرضية القراءة — وهو مقصود ومكتوب
    if (s > MIN_SCALE) expect(area).toBeLessThanOrEqual(MAX_CANVAS_AREA * 1.001);
  });

  it.each(pages)("%s صفحة: الضلع تحت السقف", (n) => {
    const h = A4_H * n;
    const s = pdfCanvasScale(A4_W, h);
    if (s > MIN_SCALE) {
      expect(h * s).toBeLessThanOrEqual(MAX_CANVAS_SIDE * 1.001);
      expect(A4_W * s).toBeLessThanOrEqual(MAX_CANVAS_SIDE * 1.001);
    }
  });

  it("والفاتورة التي شكا منها — مئةُ بندٍ في عشر صفحات — تمرّ", () => {
    const h = A4_H * 10;
    const s = pdfCanvasScale(A4_W, h);
    expect(A4_W * s * h * s).toBeLessThanOrEqual(MAX_CANVAS_AREA * 1.001);
    // وكانت بالثابتة 2 تتجاوزه أضعافاً — وهذا هو العطل بعينه
    expect(A4_W * 2 * h * 2).toBeGreaterThan(MAX_CANVAS_AREA);
  });
});

describe("والمدخل الفاسد لا يُضحّي بالحدّة", () => {
  it("قياسٌ فشل يعود بالدقّة القصوى", () => {
    expect(pdfCanvasScale(0, 0)).toBe(MAX_SCALE);
    expect(pdfCanvasScale(NaN, 100)).toBe(MAX_SCALE);
    expect(pdfCanvasScale(-1, -1)).toBe(MAX_SCALE);
    expect(pdfCanvasScale(undefined, undefined)).toBe(MAX_SCALE);
  });

  it("وعنصرٌ لا يُقاس كذلك — لا يسقط التصدير لأجل قياس", () => {
    expect(pdfScaleForElement(null)).toBe(MAX_SCALE);
    expect(pdfScaleForElement(undefined)).toBe(MAX_SCALE);
    expect(pdfScaleForElement({})).toBe(MAX_SCALE);
  });

  it("وعنصرٌ طويل يُقاس فعلاً", () => {
    expect(pdfScaleForElement({ scrollWidth: A4_W, scrollHeight: A4_H * 30 })).toBeLessThan(MAX_SCALE);
  });
});

/* ─────────── ٢) النسخة المحقونة تطابق الأصل ─────────── */

/**
 * شريط أدوات الورقة يعيش **داخل المستند** لا في التطبيق، فلا يستطيع
 * الاستيراد. فنسخةٌ بـJavaScript خام لا مفرّ منها — وتُقارَن هنا بالأصل عدداً
 * بعدد، فلا تنحرف إحداهما بصمت.
 */
describe("نسخة الشريط تطابق الأصل", () => {
  const numbersIn = (src: string) =>
    (src.match(/\d[\d_]*/g) || []).map((n) => Number(n.replace(/_/g, "")));

  it("الحدود الأربعة كلّها في النصّ المحقون", () => {
    for (const v of [MAX_CANVAS_SIDE, MAX_CANVAS_AREA, MIN_SCALE, MAX_SCALE]) {
      expect(numbersIn(PDF_SCALE_INLINE_JS)).toContain(v);
    }
  });

  it("وتحسب النسبة بنفس الصيغة", () => {
    expect(PDF_SCALE_INLINE_JS).toContain("Math.sqrt(MAX_AREA / (w * h))");
    expect(PDF_SCALE_INLINE_JS).toContain("MAX_SIDE / w");
    expect(PDF_SCALE_INLINE_JS).toContain("MAX_SIDE / h");
  });

  it("وتحرس المدخل الفاسد كما يحرسه الأصل", () => {
    expect(PDF_SCALE_INLINE_JS).toContain("w <= 0 || h <= 0");
    expect(PDF_SCALE_INLINE_JS).toContain("isFinite");
  });

  it("والقالب يحقنها ويستعملها بدل الثابتة", () => {
    const tpl = read("src/utils/printTemplate.ts");
    expect(tpl).toContain("PDF_SCALE_INLINE_JS");
    expect(tpl).toContain("scale: __lovPdfScale(el.scrollWidth, el.scrollHeight)");
  });
});

/* ─────────── ٣) لا مخرجَ بقي على الثابتة ─────────── */

describe("كل مخارج الـPDF على الدقّة المشتقّة", () => {
  const EXPORTS = [
    "src/utils/printTemplate.ts",
    "src/utils/shareDocumentPdf.ts",
    "src/utils/stockMovementsPrint.ts",
    "src/pages/StandaloneShareDocument.tsx",
    "src/pages/PublicDocumentSharePage.tsx",
    "src/pages/StatementPreviewPage.tsx",
    "src/pages/FinancialReportPreviewPage.tsx",
    "src/pages/ProductsPage.tsx",
  ];

  it.each(EXPORTS)("%s لا يحمل دقّةً ثابتة", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/html2canvas:\s*\{\s*scale:\s*\d/);
  });

  it.each(EXPORTS)("%s يشتقّها", (file) => {
    const src = read(file);
    expect(src).toMatch(/pdfScaleForElement\(|__lovPdfScale\(/);
  });

  it("والقائمة تغطّي ما وجدناه — فحصٌ لا يُفرَّغ", () => {
    expect(EXPORTS.length).toBeGreaterThanOrEqual(8);
  });
});
