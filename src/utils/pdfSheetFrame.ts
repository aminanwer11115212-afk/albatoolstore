/**
 * تحييدُ إطار الشاشة قبل تصوير الورقة في PDF.
 *
 * ## العطل
 * زرّ «واتساب PDF» في إنشاء الفاتورة وتعديلها يُخرج ورقةً تخالف المعاينة
 * ورابطَ العميل: هوامشُها أعرض، وتحتها بياضٌ إلى آخر الصفحة، وفي حوافّها
 * ظِلٌّ رمادي.
 *
 * ## والسبب أن الورقة تُصوَّر بوسيط `screen`
 * القالب يلبس الورقةَ على الشاشة إطارَ عرضٍ في `@media screen`: عرضٌ 210mm
 * وحشوٌ 10mm وارتفاعٌ أدنى 297mm وظِلٌّ وأرضيةٌ رمادية. وhtml2canvas يصوّر
 * بوسيط الشاشة لا الطباعة، فيدخل هذا الإطارُ الملفَّ كلَّه:
 *
 *   • حشوُ 10mm **فوق** هامش html2pdf (8mm) — فالمحتوى أضيق بمقدار الفرق،
 *     وهو ما يُرى «خطّاً أصغر وشكلاً مختلفاً».
 *   • `min-height: 297mm` — فالفاتورة القصيرة تُصوَّر بطول صفحةٍ كاملة
 *     فيخرج تحتها بياضٌ لا داعي له.
 *   • `box-shadow` — شريطٌ رماديّ على حوافّ الورقة في الملف.
 *
 * وشريطُ الأدوات داخل الورقة يُحيّد هذا الإطار منذ البداية (راجع `contentEl`
 * في `printTemplate`)، فمن يُصدّر من المعاينة يحصل على الشكل الصحيح ومن
 * يُصدّر من شاشة الإدخال لا يحصل عليه. فالقاعدة هنا واحدةٌ للمسارين.
 *
 * ## وتسرُّبُ الأنماط
 * وسمُ `<style>` عامٌّ في المستند أينما وُضع. فحقنُ أنماط الورقة في صفحة
 * التطبيق يُلبس عناصرَ التطبيق نفسها أرضيةَ الورقة الرمادية وظِلَّها ما دام
 * التوليد جارياً. ثبت بالتصيير: عنصر `.page` في التطبيق خرج بظِلّ الورقة.
 *
 * فتُنزع كتلُ `@media screen` قبل الحقن: الـPDF لا يحتاجها — إذ يُحيَّد ما
 * فيها على أي حال — والتطبيق لا يريدها.
 */

/**
 * عرضُ الورقة بالبكسل — A4 (210mm) على 96 نقطة في البوصة.
 *
 * ويُمرَّر إلى html2canvas بوصفه `windowWidth` كذلك، لا إلى الحاوية وحدها:
 * html2canvas يستنسخ المستند في إطارٍ بعرض **نافذة التطبيق** لا بعرض العنصر.
 * فعلى شاشةٍ أضيق من الورقة يُخطَّط المستنسخُ في إطارٍ ضيّق، وتفيض الورقةُ
 * منه — وفي RTL يكون الفيضان **يساراً بإحداثيّاتٍ سالبة**، خارج المنطقة
 * التي يصوّرها. فيخرج عمودُ «الإجمالي» والتاريخُ ورقمُ الفاتورة مقصوصةً من
 * الحافّة.
 *
 * ولا يظهر في المعاينة لأن ورقتها مستندٌ قائمٌ بذاته، نافذتُه بعرض الورقة.
 */
export const SHEET_WIDTH_PX = 794;

/** وسمُ أنماط الورقة — به تُعرف من أنماط التطبيق. راجع `onlySheetStyles`. */
export const SHEET_STYLE_ATTR = "data-lov-sheet-style";

/**
 * تنقيةُ نسخة html2canvas من أنماط التطبيق.
 *
 * ## العطل
 * الورقةُ تُركَّب داخل صفحة التطبيق، فتسري عليها أنماطُ التطبيق كلُّها —
 * Tailwind وما بُني عليه. ثمّ يستنسخ html2canvas المستند **بأنماطه** في إطارٍ
 * عرضُه عرضُ الورقة (794px) لا عرضُ الجهاز.
 *
 * وهنا تقع العلّة: نقاطُ توقّف Tailwind تُقاس بعرض الإطار. فما كان على هاتفٍ
 * 412px يقع تحت `md` يصير في النسخة فوقه، فتسري قواعدُ مقاسٍ آخر على ورقةٍ
 * لم تُصمَّم لها. فتخرج الورقةُ المصوَّرة أوسعَ من إطارها وتُقصّ حافّتها:
 * عمودُ «الإجمالي» والتاريخُ ورقمُ الفاتورة ومربّعُ الحساب.
 *
 * ولا يظهر في قياس الصفحة نفسها — قِيست فوجدت 794px بلا فيضان. العطلُ في
 * النسخة وحدها، ولا يُرى إلا في الملفّ الناتج.
 *
 * ## والعلاج: الورقة تحمل أنماطها
 * `generatePrintHTML` يُخرج ورقةً كاملةً بأنماطها، لا تحتاج من التطبيق شيئاً.
 * فتُنزع أنماطُ التطبيق من النسخة ويبقى ما وُسم بـ`SHEET_STYLE_ATTR`.
 *
 * وبهذا تصير ورقةُ المشاركة مستقلّةً عن التطبيق كورقةِ المعاينة تماماً —
 * وهي «قاعدة الورقة الواحدة» نفسها: قالبٌ واحد لا يتأثّر بمن يستضيفه.
 */
export function onlySheetStyles(clonedDoc: Document): void {
  const nodes = clonedDoc.querySelectorAll<HTMLElement>(
    'style, link[rel="stylesheet"]',
  );
  for (const node of Array.from(nodes)) {
    if (!node.hasAttribute(SHEET_STYLE_ATTR)) node.remove();
  }
}

/**
 * ما يُعاد ضبطه على `.page` — مصدرٌ واحد يقرأ منه المساران.
 *
 * يقابله في شريط الأدوات ضبطٌ بنفس الخصائص مكتوبٌ بجافاسكربت خام داخل نصّ
 * القالب (لا يمكن استيراده)، ويقارنهما `pdfSheetFrame.test.ts` خاصّيةً
 * خاصّية — فلا ينزاح أحدهما عن الآخر بصمت.
 */
export const SHEET_PAGE_RESET: Record<string, string> = {
  width: "auto",
  maxWidth: "none",
  minHeight: "0",
  padding: "0",
  boxShadow: "none",
  zoom: "1",
};

/** وأرضيةُ الحاوية بيضاء بلا حشو — هامشُ html2pdf وحده يفصل. */
export const SHEET_HOST_RESET: Record<string, string> = {
  background: "#fff",
  padding: "0",
};

/**
 * ينزع كتل `@media` الخاصّة بالشاشة وحدها.
 *
 * الشرط: استعلامٌ يذكر `screen` ولا يذكر `print`، أو استعلامُ مقاسٍ مجرَّد
 * (`@media (max-width: …)`) — فهذه كلُّها تنسيقُ عرضٍ لا يدخل الورق. وما ذكر
 * `print` يبقى: هو الشكل المقصود.
 *
 * والمطابقة بعدّ الأقواس لا بتعبيرٍ نمطي: كتلةُ `@media` تحوي قواعد بأقواسها،
 * فأيّ `\}` يوقف تعبيراً نمطياً عند أوّل قاعدةٍ داخلها ويترك الباقي معلّقاً.
 */
export function stripScreenOnlyCss(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    const braceAt = css.indexOf("{", at);
    if (braceAt === -1) {
      out += css.slice(i);
      break;
    }
    const query = css.slice(at + "@media".length, braceAt).trim().toLowerCase();

    // نهاية الكتلة بعدّ الأقواس
    let depth = 0;
    let end = braceAt;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (end >= css.length) {
      // كتلةٌ غير مغلقة: لا نقصّ ما لا نفهمه
      out += css.slice(i);
      break;
    }

    const hasPrint = /\bprint\b/.test(query);
    const hasScreen = /\bscreen\b/.test(query);
    const bareFeature = !hasPrint && !hasScreen && query.startsWith("(");
    const screenOnly = (hasScreen && !hasPrint) || bareFeature;

    out += css.slice(i, at);
    if (!screenOnly) out += css.slice(at, end + 1);
    i = end + 1;
  }
  return out;
}

/**
 * يُطبّق الضبط على الحاوية وورقتها — إعلاناتٌ سطرية تغلب أي ورقة أنماط.
 *
 * وتُنزع العناصر المخفية بزرّ «تخصيص الرؤية»: يُعلّمها شريطُ الأدوات بصنف
 * `__lov_hidden`، وإخفاؤها بـ`display:none` يكفي على الشاشة ولا يكفي في
 * التصوير.
 */
export function neutralizeSheetFrame(host: HTMLElement): void {
  for (const [prop, value] of Object.entries(SHEET_HOST_RESET)) {
    (host.style as any)[prop] = value;
  }
  host.querySelectorAll(".__lov_hidden").forEach((n) => n.remove());
  const page = host.querySelector<HTMLElement>(".page");
  if (!page) return;
  for (const [prop, value] of Object.entries(SHEET_PAGE_RESET)) {
    (page.style as any)[prop] = value;
  }
}
