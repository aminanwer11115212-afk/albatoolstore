/**
 * ملاءمة ورقة المستند لعرض الإطار — رابط العميل كالمعاينة.
 *
 * ## العطل كما رآه صاحب المستودع
 * أرسل صورتين من هاتفه: **المعاينة** تُظهر الورقة كاملةً، و**رابط العميل**
 * يُظهر ثُلثها مقصوصاً. وقال: «اجعل رابط العميل مثل شكل المعاينة، أكبر لأرى
 * أوضح، وليس هكذا».
 *
 * ## والسبب بنيويّ لا تنسيقيّ
 * `StandaloneShareDocument` تجرّب دالّة القاعدة أوّلاً، فإن لم تكن الهجرة
 * مطبَّقة **سقطت إلى دالّة الحافة القديمة** — وتلك تبني HTML من عندها لا من
 * `generatePrintHTML`. فأيّ ملاءمةٍ تُكتب داخل قالبنا لا تصل تلك الورقة.
 * ولا سبيل لإصلاح الحافة من هنا: سياسة لافابل ترفض تعديلها.
 *
 * فصار **المضيف يقيس ما بداخله** ويصغّره حتى يدخل الإطار — فيعمل مع القالب
 * ومع غيره. وهذا ما يفحصه هذا الملفّ.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fitRatio, clampUserScale, MIN_USER_SCALE, MAX_USER_SCALE, SCALE_STEP } from "@/utils/documentFrameFit";
import { generatePrintHTML } from "@/utils/printTemplate";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const sheet = generatePrintHTML({
  type: "invoice", number: "INV-1", date: "2026-08-05",
  customer: { name: "عميل" },
  items: [{ product_name: "صنف", quantity: 1, unit_price: 1000, tax_amount: 0, discount: 0, total: 1000 }],
  subtotal: 1000, taxTotal: 0, discountTotal: 0, grandTotal: 1000, company: null,
} as any);

/* ─────────── ١) حساب النسبة ─────────── */

describe("نسبة الملاءمة", () => {
  it("ورقةٌ أعرض من الإطار تُصغَّر بنسبة العرضين", () => {
    // ورقة A4 (794px) في إطار هاتف (390px)
    expect(fitRatio(794, 390)).toBeCloseTo(390 / 794, 5);
  });

  it("ولا تُكبَّر فوق مقاسها حين يتّسع الإطار — التكبير للقارئ لا للملاءمة", () => {
    expect(fitRatio(794, 1200)).toBe(1);
    expect(fitRatio(794, 794)).toBe(1);
  });

  it("ولا تنزل تحت الخُمس مهما ضاق الإطار", () => {
    expect(fitRatio(794, 50)).toBe(0.2);
  });

  it("ومقاسٌ غير معلومٍ يترك الورقة على حالها — لا صفحةَ فارغة", () => {
    expect(fitRatio(0, 390)).toBe(1);
    expect(fitRatio(794, 0)).toBe(1);
    expect(fitRatio(NaN, 390)).toBe(1);
    expect(fitRatio(-100, 390)).toBe(1);
  });
});

describe("حدود تكبير القارئ", () => {
  it("لا يتجاوز الحدّين", () => {
    expect(clampUserScale(99)).toBe(MAX_USER_SCALE);
    expect(clampUserScale(0.01)).toBe(MIN_USER_SCALE);
  });

  it("والقيمة الفاسدة تعود إلى الملاءمة التامّة", () => {
    // غير المحدود ليس تكبيراً بل خطأ حساب — فيُقرأ ملاءمةً تامّة لا أقصى تكبير
    expect(clampUserScale(NaN)).toBe(1);
    expect(clampUserScale(Infinity)).toBe(1);
  });

  it("والخطوة محسوسةٌ لا مجهرية", () => {
    expect(SCALE_STEP).toBeGreaterThanOrEqual(0.2);
    expect(MAX_USER_SCALE).toBeGreaterThanOrEqual(2);
  });
});

/* ─────────── ٢) القالب يقول كيف، والمضيف يقول كم ─────────── */

describe("القالب يعلن نفسه ويقبل النسبة", () => {
  it("الورقة موسومةٌ ليعرفها المضيف", () => {
    expect(sheet).toContain('data-lov-sheet="1"');
  });

  it("وتصغُر بالمتغيّر الذي يكتبه المضيف", () => {
    expect(sheet).toMatch(/zoom:\s*var\(--lov-fit,\s*1\)/);
  });

  it("والتصغير في وسيط الشاشة وحده — الطباعة لا تراه", () => {
    const screenBlock = sheet.slice(sheet.indexOf("@media screen"), sheet.indexOf("/* === HEADER === */"));
    expect(screenBlock).toContain("zoom: var(--lov-fit, 1)");
  });

  it("ولا يقيس القالب بنفسه — لا سكربتَ ملاءمةٍ فيه يتنازع مع المضيف", () => {
    expect(sheet).not.toContain("SHEET_PX");
    expect(sheet).not.toContain("orientationchange");
  });

  it("ومقاس الورقة يبقى في القالب وحده — لا رقمَ بالمليمتر في المُلائِم", () => {
    const fitSrc = read("src/utils/documentFrameFit.ts");
    expect(fitSrc).not.toContain("210mm");
    expect(fitSrc).not.toContain("297mm");
    // ولا حتى مقابله بالبكسل: القياس من المرسوم لا من رقمٍ محفوظ
    expect(fitSrc).not.toContain("794");
  });
});

/* ─────────── ٣) الصفحتان على مُلائِمٍ واحد ─────────── */

describe("المعاينة ورابط العميل يلائمان بنفس الكود", () => {
  const PAGES = ["src/pages/DocumentPreviewPage.tsx", "src/pages/StandaloneShareDocument.tsx"];

  it.each(PAGES)("%s تستعمل useDocumentFrameFit", (file) => {
    expect(read(file)).toContain("useDocumentFrameFit");
  });

  it.each(PAGES)("%s تعرض أزرار التكبير", (file) => {
    expect(read(file)).toContain("DocumentFrameZoom");
  });

  it.each(PAGES)("%s تُعيد القياس عند تحميل الإطار", (file) => {
    expect(read(file)).toContain("frameFit.refit");
  });

  it("ولا واحدةَ منهما تحمل مقاس ورقٍ خاصّاً بها — قاعدة الورقة الواحدة", () => {
    for (const file of PAGES) {
      expect(read(file)).not.toContain("210mm");
      expect(read(file)).not.toContain("297mm");
    }
  });
});

/**
 * التصغير تنسيقُ عرضٍ لا يدخل الملف: html2canvas يصوّر بوسيط الشاشة، فلولا
 * تصفيرُه لخرج الـPDF من الهاتف بنصف حجم خطّه.
 */
describe("التصغير لا يدخل الـPDF", () => {
  it("معاينة النظام تُصفّره على النسخة", () => {
    const tpl = read("src/utils/printTemplate.ts");
    const fn = tpl.slice(tpl.indexOf("function contentEl()"), tpl.indexOf("function genPdfBlob()"));
    expect(fn).toContain("pg.style.zoom = '1'");
  });

  it("ورابط العميل كذلك", () => {
    const share = read("src/pages/StandaloneShareDocument.tsx");
    const fn = share.slice(share.indexOf("handleDownloadPdf"), share.indexOf("html2pdf()"));
    expect(fn).toContain('page.style.zoom = "1"');
  });
});
