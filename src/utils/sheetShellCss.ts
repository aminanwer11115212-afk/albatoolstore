/**
 * قشرةُ الورقة — تنسيقُ الورقة نفسِها، مرّةً واحدة لكل مخرَجات النظام.
 *
 * ## العطل الذي أخرجها
 * كان كلُّ قالبِ طباعةٍ يكتب ورقتَه بيده، فخرجت الأوراقُ بمقاساتٍ شتّى.
 * قِيست بالمتصفّح (عرضُ المحتوى بالمليمتر، معاينةً وورقاً):
 *
 *   | المخرَج              | المعاينة | الورق  | الفرق    |
 *   |----------------------|----------|--------|----------|
 *   | الفاتورة/عرض السعر   | 190      | 190    | مطابق    |
 *   | كشف الحساب           | 199.5    | 179.4  | −20.1mm  |
 *   | التقرير المالي       | 199.5    | 179.4  | −20.1mm  |
 *   | الترحيل / التغليف    | 199.5    | 190    | −9.5mm   |
 *   | الأصناف غير المتوفّرة| 199.5    | 190    | −9.5mm   |
 *   | كشف الترحيلات        | 208      | 196.1  | −11.9mm  |
 *
 * وله سببان اثنان:
 *
 * ### ١) الشاشةُ عمودٌ لا ورقة
 * كانت هذه القوالبُ تعرض المحتوى في `max-width: 800px` (نحو 211.7mm) على
 * أرضيةٍ بيضاء — عمودٌ يتبع النافذة، لا ورقةَ A4. فما يراه صاحبُه في
 * المعاينة أعرضُ ممّا ينزل ورقاً، فتتغيّر أعرضُ الأعمدة ومواضعُ التفاف
 * الأسطر بين الاثنين.
 *
 * ### ٢) إلغاءُ الهامش مكتوبٌ **فوق** الهامش
 * وهذا أخبثُهما. الترتيب في كشف الحساب والتقرير المالي كان:
 *
 *     (١)  @media print { body { padding: 0; } }
 *     (٢)  body { padding: 20px; }
 *
 * وكلاهما على العنصر نفسِه بنفس الأولوية (specificity)، فيفوز **الأخير**.
 * أي أن سطرَ الطباعة ميّتٌ لا يُنفَّذ: الورقةُ تُطبع وفيها 20px هامشاً
 * زائداً على هامش `@page`، فيضيق المحتوى من 190mm إلى 179.4mm.
 *
 * ولم يظهر العطلُ في قالب الفاتورة لأن فيه كتلةَ `@media print` ثانيةً في
 * آخر التنسيق تُصلح ما أفسده الترتيب — مصادفةٌ لا تصميم. ولذلك يُقاس هذا
 * كلُّه بالتعاقب الفعليّ لا بوجود السطر: يحرسه
 * `src/test/printSheetGeometry.test.ts`.
 *
 * ## العقد
 * كلُّ قالبٍ يلفّ محتواه في `<div class="page">`، ويُلحق ناتجَ هذه الدالّة
 * **آخرَ** كتلة `<style>`. فتكون الورقةُ:
 *
 *   • على الشاشة: صفحةٌ بيضاء بعرض 210mm وهامش 10mm على أرضيةٍ رمادية.
 *   • على الورق:  هامشُ `@page` وحده — لا هامشَ ثانٍ من body ولا من page.
 *
 * وفي الحالتين عرضُ المحتوى واحد: 190mm.
 */
import { A4_MM } from "@/utils/sheetPagePlan";

export interface SheetShellOpts {
  /** ورقةٌ عرضية (A4 landscape) — لجداول الحركات العريضة. */
  landscape?: boolean;
  /**
   * ارتفاعُ شريطِ أدواتٍ مثبّت (position: fixed) أعلى الصفحة، إن وُجد.
   * يُترك له فراغٌ فوق الورقة **على الشاشة وحدها** — والطباعة تُخفيه.
   */
  toolbarPx?: number;
}

/** عرضُ الورقة وارتفاعُها بالمليمتر حسب الاتجاه. */
export function sheetSizeMm(landscape = false) {
  return landscape
    ? { width: A4_MM.height, height: A4_MM.width }
    : { width: A4_MM.width, height: A4_MM.height };
}

/** عرضُ المحتوى الصالح — هو نفسُه في المعاينة وفي الورق. */
export function sheetContentMm(landscape = false): number {
  return sheetSizeMm(landscape).width - 2 * A4_MM.margin;
}

export function sheetShellCss({ landscape = false, toolbarPx = 0 }: SheetShellOpts = {}): string {
  const size = sheetSizeMm(landscape);
  const topGap = toolbarPx > 0 ? toolbarPx : 10;

  return `
  /* ===== قشرةُ الورقة — مصدرُها الواحد: src/utils/sheetShellCss.ts =====
     تُلحق آخرَ كتلة style عمداً: قواعدُ الطباعة هنا تُلغي هوامشَ body،
     ولو سبقت قاعدةَ body العادية لغلبتها الأخيرةُ بالترتيب فماتت. */
  @page { size: A4${landscape ? " landscape" : ""}; margin: ${A4_MM.margin}mm; }

  @media screen {
    body {
      background: #e5e7eb;
      margin: 0;
      padding: ${topGap}px 0 10px;
    }
    .page {
      width: ${size.width}mm;
      max-width: ${size.width}mm;
      min-height: ${size.height}mm;
      margin: 0 auto;
      background: #fff;
      padding: ${A4_MM.margin}mm;
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.18);
    }
  }

  @media print {
    body { background: #fff; margin: 0; padding: 0; }
    .page {
      width: auto;
      max-width: none;
      min-height: 0;
      margin: 0;
      padding: 0;
      background: #fff;
      box-shadow: none;
    }
    /* الأرضياتُ تُطبع كما تُعرض — المتصفّحاتُ تُسقطها افتراضاً توفيراً للحبر،
       فيخرج خطٌّ أبيضُ على ورقٍ أبيض. */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .toolbar, .noprint { display: none !important; }
  }
`;
}
