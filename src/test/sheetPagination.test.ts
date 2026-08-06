/**
 * ترقيمُ صفحات المعاينة — «المعاينة بتنسيق الـPDF».
 *
 * ## ما طُلب
 * «كلُّ الشاشات الخاصة بالمعاينة تكون منسّقة بتنسيق الـPDF، فإذا زاد عن الـA4
 * تُقسم، وأضِف ترقيم صفحات — فإذا كانت الفاتورة ثلاث صفحات يظهر تحت 1 من 3».
 *
 * ## وحدودُ ما يُفحص هنا
 * القياسُ الحقيقي (أين يقع الحدُّ، وهل عبره بند) في
 * `e2e/print-rows-per-page.spec.ts` — jsdom لا يخطّط فلا يعرف ارتفاعاً. وهذا
 * الملفّ يحرس **العقد**: أنّ السكربت يصل الورقة، وأنه لا يصل الملفَّ الناتج،
 * وأن الطباعة تُخفي فواصله.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "@/utils/printTemplate";
import {
  PAGINATION_CSS, PAGINATION_INLINE_JS, CONTENT_MM, ATOM_SELECTOR, FOOTER_H_PX,
} from "@/utils/sheetPagination";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const sheet = () => generatePrintHTML({
  type: "invoice", number: "INV-1", date: "2026-08-06",
  customer: { name: "عميل" },
  items: [{ product_name: "صنف", quantity: 1, unit_price: 1000, tax_amount: 0, discount: 0, total: 1000 }],
  subtotal: 1000, taxTotal: 0, discountTotal: 0, grandTotal: 1000, company: null,
} as any);

/* ─────────── ١) الترقيم يصل الورقة ─────────── */

describe("الترقيمُ جزءٌ من الورقة لا من مضيفها", () => {
  const html = sheet();

  it("أنماطُه وسكربتُه في الورقة نفسها", () => {
    expect(html).toContain(".lov-pgfoot");
    expect(html).toContain("lov-pgbreak");
    expect(html).toContain("من ");
  });

  it("فيصل المعاينةَ ورابطَ العميل معاً — كلاهما يعرض ناتج القالب", () => {
    // «قاعدة الورقة الواحدة»: لا تنسيقَ يُكتب في الصفحتين المضيفتين
    for (const p of ["src/pages/DocumentPreviewPage.tsx", "src/pages/StandaloneShareDocument.tsx"]) {
      expect(read(p)).not.toContain("lov-pgfoot");
    }
  });

  it("والحدودُ من وحدةٍ واحدة لا أرقاماً في القالب", () => {
    expect(CONTENT_MM).toBe(277);          // 297 ناقص هامشَي 10mm
    expect(PAGINATION_INLINE_JS).toContain(`var CONTENT_MM = ${CONTENT_MM};`);
    expect(PAGINATION_INLINE_JS).toContain(`var FOOT = ${FOOTER_H_PX};`);
  });
});

/* ─────────── ٢) لا يقطع ما لا يُقطع ─────────── */

describe("القطعُ يحترم ما لا يُشطر", () => {
  it("عناصرُه هي نفسُها التي يحترمها تقطيعُ الـPDF", () => {
    const pdf = read("src/utils/shareDocumentPdf.ts");
    for (const sel of ATOM_SELECTOR.split(",").map((s) => s.trim())) {
      expect(pdf, `${sel} في UNSPLITTABLE`).toContain(sel);
    }
  });

  it("ويرفع العنصرَ إلى مرساه في التدفّق — الفاصلُ في سطرِ مرونة لا يدفع شيئاً", () => {
    expect(PAGINATION_INLINE_JS).toContain("flowAnchor");
    expect(PAGINATION_INLINE_JS).toMatch(/display\.indexOf\('flex'\)/);
    expect(PAGINATION_INLINE_JS).toContain("columnCount");
  });

  it("ويقيس مرّةً ثمّ يُدرج — لا إعادةَ تخطيطٍ لكلّ بند", () => {
    // الإزاحةُ تراكمية: `shift` يُجمع في القياس، والإدراجُ بعده
    expect(PAGINATION_INLINE_JS).toContain("shift");
    const measureAt = PAGINATION_INLINE_JS.indexOf("getBoundingClientRect");
    const insertAt = PAGINATION_INLINE_JS.indexOf("insertBefore");
    expect(measureAt).toBeGreaterThan(0);
    expect(insertAt).toBeGreaterThan(measureAt);
  });
});

/* ─────────── ٣) ولا يدخل الملفَّ ولا الطباعة ─────────── */

describe("الترقيمُ للمعاينة وحدها", () => {
  it("الطباعةُ تُخفي فواصله — المتصفّح يقسّم بنفسه", () => {
    expect(PAGINATION_CSS).toMatch(
      /@media print \{[^}]*\.lov-pgbreak[^}]*display: none/s,
    );
  });

  /**
   * `buildPdfBlob` يستورد الورقة بـ`importNode` وينزع سكربتاتها، فلا يعمل
   * الترقيمُ هناك أصلاً — والملفُّ يُقطَّع بحسابه هو. ولو عمل لأضاف فواصلَ
   * صفحاتٍ فوق تقطيعه: قِيس 2184 ← 3774 من ارتفاع اللوحة.
   */
  it("والملفُّ لا يرى السكربت — يُنزع قبل التركيب", () => {
    const pdf = read("src/utils/shareDocumentPdf.ts");
    expect(pdf).toMatch(/querySelectorAll\("script"\)\.forEach\(\(s\) => s\.remove\(\)\)/);
  });

  it("وصفحةٌ واحدة بلا ترقيمٍ ولا فاصل — الرقمُ يفيد حين تتعدّد", () => {
    expect(PAGINATION_INLINE_JS).toContain("if (pages < 2) return;");
  });
});

/* ─────────── ٤) الحرّاسُ داخل السكربت ─────────── */

describe("السكربتُ محروسٌ من نفسه", () => {
  it("يُعيد الحساب بلا تراكم — يمسح فواصلَه أوّلاً", () => {
    expect(PAGINATION_INLINE_JS).toContain("function clear(page)");
    expect(PAGINATION_INLINE_JS).toMatch(/clear\(page\);/);
  });

  /**
   * ## التصغيرُ لا يخلط الوحدتين
   *
   * المعاينةُ على الهاتف مصغَّرةٌ بـzoom (ملاءمة 46%). و`getBoundingClientRect`
   * يُرجع المقاسَ **مصغَّراً**، بينما `offsetHeight` و`scrollHeight` وما يُكتب
   * في `style.top` بكسلاتُ CSS **غير مصغَّرة**.
   *
   * وخلطُهما صوّره صاحبُ المستودع: عددُ الصفحات خرج **ثلاثاً وهي اثنتان**،
   * وشرائطُ الترقيم وقعت **فوق البنود** لأن مواضعها كُتبت بنسبة 46% من مكانها.
   */
  it("والتصغيرُ لا يخلط الوحدتين — قياسٌ مصغَّرٌ وكتابةٌ غيرُ مصغَّرة", () => {
    // النسبةُ تُشتقّ من المسبار نفسه: مقاسُه المعروض على مقاسه بالـCSS
    expect(PAGINATION_INLINE_JS).toContain("probe.offsetHeight");
    expect(PAGINATION_INLINE_JS).toMatch(/zoom = \(css > 0 && shown > 0\) \? shown \/ css : 1/);
    // وكلُّ ما يُقاس بـrect يُقسَّم عليها قبل أن يُكتب
    expect(PAGINATION_INLINE_JS).toMatch(/\(r\.top - top0\) \/ zoom/);
    expect(PAGINATION_INLINE_JS).toMatch(/\(r\.bottom - top0\) \/ zoom/);
    expect(PAGINATION_INLINE_JS).toContain("padTop * zoom");
  });

  it("وخطؤُه لا يُسقط الورقة", () => {
    expect(PAGINATION_INLINE_JS).toMatch(/try \{ paginate\(\); \} catch/);
  });

  it("ولا علامةَ اقتباسٍ خلفية فيه — تُنهي نصّ القالب", () => {
    expect(PAGINATION_INLINE_JS).not.toContain("`");
    expect(PAGINATION_CSS).not.toContain("`");
  });
});
