/**
 * دقّةُ تصوير الورقة — لماذا يخرج الـPDF **فارغاً** في الفاتورة الكبيرة.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «راجعهم لما تبقى فاتورة كبيرة، الـPDF بمشي فاضي».
 *
 * ## والسبب ليس في الورقة بل في الرسم
 * `html2pdf` يصوّر الورقة كلّها في **لوحة رسمٍ واحدة** (canvas) ثم يقصّها
 * صفحاتٍ. واللوحة لها سقفٌ في المتصفّح: طولُ ضلعٍ أقصى، ومساحةٌ قصوى. فوقه
 * لا يرمي المتصفّح خطأً — **يُعيد لوحةً فارغة**. فيخرج الملف أبيضَ بلا سطر،
 * وبلا رسالةٍ تدلّ.
 *
 * وكانت الدقّة مكتوبةً رقماً ثابتاً `scale: 2` في كل مسار. فاتورةُ عشرة بنود
 * تُصوَّر في 1588×2245 — لا شيء. ومئةُ بندٍ في عشر صفحات تصير 1588×22450،
 * أي 35 مليون بكسل. وسقفُ الهاتف أقلّ من ذلك، فيسقط صامتاً.
 *
 * ولهذا يقع العطل **في الكبيرة وحدها**: الصغيرة تحت السقف دائماً.
 *
 * ## الحلّ: الدقّة تُشتقّ من الحجم
 * تُحسب أعلى دقّةٍ تبقى تحت السقف. فالورقة الصغيرة تُصوَّر بضعفين كما كانت،
 * والطويلة تنزل بقدرِ ما تحتاج — **ولا تنزل تحت `MIN_SCALE`**: ملفٌّ لا يُقرأ
 * أسوأ من ملفٍّ أقلّ حدّة، والصفحة الأطول أهون من صفحةٍ فارغة.
 *
 * ## السقوف ولماذا هي متحفّظة
 * كروم على الحاسوب يحتمل 16384 ضلعاً و268 مليون بكسل. لكنّ **الهاتف** أضيق
 * بكثير، وذاكرتُه تُنهَك قبل السقف النظري — والهاتف هو أكثر ما يُشارَك منه.
 * فالحدود هنا محسوبةٌ للأضعف لا للأقوى: ما يمرّ على الهاتف يمرّ على غيره.
 */

/**
 * أقصى طول ضلعٍ آمن.
 *
 * كروم يحتمل 65535 وسفاري 32767 — فالحدّ هنا دون الأضعف بقليل، ولا يبلغه
 * مستندٌ عادي إلا فوق ثلاثين صفحة.
 */
export const MAX_CANVAS_SIDE = 32760;
/**
 * وأقصى مساحةٍ آمنة بالبكسل — سقف iOS التاريخي 4096×4096.
 *
 * وهو الحدّ الذي يمرّ على كل جهاز. والتحفّظ هنا مقصود: **ملفٌّ أقلّ حدّة خيرٌ
 * من ملفٍّ فارغ**، وهذا بالضبط ما اشتُكي منه. فحتى لو احتمل جهازٌ أكثر، لا
 * نراهن بحدّةٍ لا تُرى على نجاحٍ قد لا يقع.
 */
export const MAX_CANVAS_AREA = 16_000_000;
/** لا تنزل الدقّة تحت هذا مهما طالت الورقة — أرضيةُ قابلية القراءة. */
export const MIN_SCALE = 1;
/** والسقف: أعلى من ضعفين لا يُحسّن شيئاً ويُثقل الملف. */
export const MAX_SCALE = 2;

/**
 * أعلى دقّةِ تصويرٍ تبقى تحت سقف لوحة الرسم.
 *
 * @param widthPx  عرض المحتوى بالبكسل  (`scrollWidth`)
 * @param heightPx طوله بالبكسل         (`scrollHeight`)
 *
 * مقاسٌ غير معلوم (صفر، أو غير رقمي، أو عنصرٌ لم يُرسم بعد) يعود بالدقّة
 * القصوى: لا نُضحّي بحدّة ورقةٍ صغيرة لأجل قياسٍ فشل.
 */
export function pdfCanvasScale(widthPx: unknown, heightPx: unknown): number {
  const w = Number(widthPx);
  const h = Number(heightPx);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return MAX_SCALE;

  const byArea = Math.sqrt(MAX_CANVAS_AREA / (w * h));
  const bySide = Math.min(MAX_CANVAS_SIDE / w, MAX_CANVAS_SIDE / h);
  const fit = Math.min(byArea, bySide);

  if (!Number.isFinite(fit)) return MAX_SCALE;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, fit));
}

/**
 * الدقّة من عنصرٍ مرسوم — مُختصَرٌ لكل مسارات الـPDF.
 *
 * محروسٌ كاملاً: عنصرٌ لا يُقاس (غير مُلحَقٍ بالمستند مثلاً) يعود بالقصوى،
 * فلا يسقط التصدير لأجل قياس.
 */
export function pdfScaleForElement(el: { scrollWidth?: number; scrollHeight?: number } | null | undefined): number {
  try {
    if (!el) return MAX_SCALE;
    return pdfCanvasScale(el.scrollWidth, el.scrollHeight);
  } catch {
    return MAX_SCALE;
  }
}

/**
 * نصُّ الدالّة بـJavaScript خام — لحقنها في شريط أدوات الورقة.
 *
 * الشريط يعيش **داخل المستند** لا في التطبيق، فلا يستطيع الاستيراد. وهذه
 * النسخة تُقارَن بالأصل في `pdfEmptyOnLargeDoc.test.ts` حرفاً بحرف، فلا
 * تنحرف إحداهما عن الأخرى بصمت.
 */
export const PDF_SCALE_INLINE_JS = `
  function __lovPdfScale(w, h) {
    var MAX_SIDE = ${MAX_CANVAS_SIDE}, MAX_AREA = ${MAX_CANVAS_AREA};
    var MIN_S = ${MIN_SCALE}, MAX_S = ${MAX_SCALE};
    w = Number(w); h = Number(h);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return MAX_S;
    var fit = Math.min(Math.sqrt(MAX_AREA / (w * h)), MAX_SIDE / w, MAX_SIDE / h);
    if (!isFinite(fit)) return MAX_S;
    return Math.max(MIN_S, Math.min(MAX_S, fit));
  }
`;
