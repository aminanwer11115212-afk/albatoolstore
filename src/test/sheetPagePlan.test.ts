/**
 * تقسيمُ الورقة إلى صفحات — الحسابُ وحده.
 *
 * كان التقسيم لـhtml2pdf عبر طبقةٍ يوسّط فيها الحاوية بـ`margin:auto` داخل
 * عرضٍ يتبع النافذة. فموضعُ الحاوية يختلف بين المستند ونسخةِ html2canvas،
 * فتخرج الورقةُ مزاحةً أو مقصوصة. ثلاثةُ أعطالٍ متتالية خرجت من هناك.
 *
 * فصار الحسابُ هنا: معلومٌ، ومُختبَرٌ بلا متصفّح.
 */
import { describe, it, expect } from "vitest";
import { planPages, pageHeights, MIN_PAGE_FILL, A4_MM } from "@/utils/sheetPagePlan";

describe("planPages", () => {
  it("ورقةٌ أقصر من صفحة ⇒ صفحةٌ واحدة", () => {
    expect(planPages(500, 1000)).toEqual([0]);
    expect(planPages(1000, 1000)).toEqual([0]);
  });

  it("وضعفُ الصفحة ⇒ صفحتان", () => {
    expect(planPages(2000, 1000)).toEqual([0, 1000]);
  });

  it("والكسرُ يُكمَّل صفحةً", () => {
    expect(planPages(2500, 1000)).toEqual([0, 1000, 2000]);
  });

  /* ─────────── القطعُ ينزل إلى حدٍّ آمن ─────────── */

  it("حدٌّ آمن قبل المثالي ⇒ يُقطع عنده", () => {
    // حدٌّ عند 940 — فوق 550 (الحدّ الأدنى) وتحت 1000
    expect(planPages(1800, 1000, [940])).toEqual([0, 940]);
  });

  it("ويُختار الأقربُ إلى المثالي لا الأبعد", () => {
    expect(planPages(1800, 1000, [600, 800, 960])).toEqual([0, 960]);
  });

  /**
   * وما بقي بعد القطع قد يتجاوز صفحةً فيُقسم مرّةً أخرى — القطعُ عند حدٍّ
   * آمنٍ لا يُلغي بقيّةَ الحساب.
   */
  it("والباقي بعد القطع يُقسم إن تجاوز صفحة", () => {
    expect(planPages(2000, 1000, [940])).toEqual([0, 940, 1940]);
  });

  /**
   * الفراغُ الكبير أقبح من شطر صفّ: حدٌّ قريبٌ من رأس الصفحة يُترك.
   */
  it("وحدٌّ أقربُ من نصف الصفحة يُترك — لا صفحةٌ شبه فارغة", () => {
    const floor = 1000 * MIN_PAGE_FILL; // 550
    expect(planPages(2000, 1000, [floor - 50])).toEqual([0, 1000]);
  });

  it("والحدُّ عند الأدنى تماماً يُقبل", () => {
    expect(planPages(1400, 1000, [550])).toEqual([0, 550]);
  });

  it("وحدٌّ بعد المثالي لا يُستعمل", () => {
    expect(planPages(2000, 1000, [1400])).toEqual([0, 1000]);
  });

  /* ─────────── سلامةُ الحلقة ─────────── */

  it("القطعُ يتقدّم دائماً — لا حلقةَ لا تنتهي", () => {
    const starts = planPages(10000, 1000, [0, 0, 0]);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1]);
  });

  it("وحدودٌ مكرّرةٌ أو سالبةٌ أو غيرُ رقمية لا تكسره", () => {
    expect(() => planPages(3000, 1000, [900, 900, -5, NaN, Infinity])).not.toThrow();
    expect(planPages(3000, 1000, [900, 900, -5, NaN, Infinity])[1]).toBe(900);
  });

  it("ومقاساتٌ صفرية تُعيد صفحةً واحدة", () => {
    expect(planPages(0, 1000)).toEqual([0]);
    expect(planPages(1000, 0)).toEqual([0]);
  });

  it("وورقةٌ طويلةٌ جدّاً لا تتجاوز عددَ صفحاتها المعقول", () => {
    const starts = planPages(100_000, 1000);
    expect(starts.length).toBeLessThanOrEqual(Math.ceil(100_000 / 1000) + 2);
    expect(starts.length).toBeGreaterThanOrEqual(100);
  });
});

describe("pageHeights", () => {
  it("مجموعُ الارتفاعات = ارتفاع الورقة", () => {
    const total = 2500;
    const starts = planPages(total, 1000, [960, 1900]);
    expect(pageHeights(starts, total).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("ولا ارتفاعَ سالباً ولا صفراً", () => {
    const total = 3333;
    const starts = planPages(total, 800, [700, 1500, 2300]);
    for (const h of pageHeights(starts, total)) expect(h).toBeGreaterThan(0);
  });
});

describe("مقاسُ A4", () => {
  it("210×297 بهامش 8", () => {
    expect(A4_MM).toEqual({ width: 210, height: 297, margin: 8 });
  });

  it("والمساحةُ الصالحة 194×281", () => {
    expect(A4_MM.width - 2 * A4_MM.margin).toBe(194);
    expect(A4_MM.height - 2 * A4_MM.margin).toBe(281);
  });
});
