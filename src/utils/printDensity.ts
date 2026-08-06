/**
 * كثافةُ الورقة: فاتورةٌ كبيرة تُطبع مقروءةً بلا تدخّل من المستخدم.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «عند إضافة فاتورة كبيرة وطباعتها PDF أنت تجد الحلّ… وإذا كثرت المنتجات
 * وبنود التغليف تجد لها حلّاً تلقائياً في طريقة العرض، مع شروطٍ وحمايةٍ
 * وحرّاس».
 *
 * فاتورةُ مئةِ بندٍ بتنسيق العشرة بنود تخرج في تسع صفحاتٍ نصفُها بياضٌ بين
 * السطور، وحملُ الملف على الواتساب يثقل، والعميل يقلّب تسع ورقاتٍ ليجد
 * الإجمالي. والحلّ ليس أن يضغط المستخدم زرّاً — بل أن تعرف الورقةُ حجمَها.
 *
 * ## القرار: ثلاث درجات، تُختار من عدد الأسطر لا من الصفحات
 * عددُ الصفحات لا يُعرف إلا بعد الرسم، وعددُ الأسطر معلومٌ قبله. فالحدود
 * على الأسطر: بنود المستند + بنود التغليف — لأن الاثنين يتقاسمان الورقة،
 * وثلاثون بنداً مع أربعين بندَ تغليفٍ ورقةٌ كبيرة وإن بدا كلٌّ منهما صغيراً.
 *
 * | الدرجة    | الأسطر  | ما يتغيّر                                   |
 * |-----------|---------|---------------------------------------------|
 * | `normal`  | ≤ 25    | لا شيء — الشكل الذي يعرفه المستخدم           |
 * | `compact` | 26–60   | حشوٌ أضيق وخطٌّ أصغر بدرجة                    |
 * | `dense`   | > 60    | + ترويسةٌ أخفض وشعارٌ أصغر                    |
 *
 * ## الحرّاس — ما لا تفعله الكثافة أبداً
 *   1. **لا تُخفي شيئاً.** لا بنداً ولا عموداً ولا إجمالياً. التصغير تنسيقٌ
 *      لا حذف — ومن أراد الإخفاء فله «تخصيص الرؤية».
 *   2. **لا تنزل تحت أرضيةِ القراءة** (`MIN_FONT_PX`). ورقةٌ لا تُقرأ أسوأ من
 *      ورقةٍ طويلة، فالتصغير يقف عند حدٍّ مكتوبٍ صراحةً لا يُتجاوز.
 *   3. **لا تمسّ الأرقام.** الإجماليات والمبالغ نصُّها واحدٌ في الدرجات الثلاث
 *      — الكثافة تغيّر المقاس لا المحتوى.
 *   4. **الحدود هنا وحدها.** لا رقمَ سحريّ في القالب: من غيّر الحدّ غيّره في
 *      موضعٍ واحد، ورآه الاختبار.
 */

export type PrintDensity = "normal" | "compact" | "dense";

/** فوق هذا العدد من الأسطر تبدأ الورقة تضغط نفسها. */
export const COMPACT_AT = 25;
/** وفوق هذا تضغط ترويستها أيضاً. */
export const DENSE_AT = 60;

/**
 * أصغر مقاس خطٍّ تسمح به أيّ درجة — بالبكسل.
 *
 * ليس زينةً: ورقةٌ بخطّ ٨px تُطبع فتُقرأ بالعدسة. فالكثافة تتوقّف هنا مهما
 * طالت الفاتورة، وتُترك البقيةُ للصفحات — الصفحة الزائدة أهون من سطرٍ لا يُقرأ.
 */
export const MIN_FONT_PX = 10;

/**
 * ما يجب أن تحمله الصفحة الأولى من بنود في درجة `compact`.
 *
 * طلبه صاحب المستودع: «عايز الورقة تشيل لي أصناف كتير زي الإكسس، بشيل ٣٠
 * صنف في الورقة الواحدة» — ومعه: «الخطّ صغار ما بتشاف».
 *
 * والمطلبان يتعارضان ما دامت المساحةُ تُؤخذ من الخطّ. فأُخذت من الترويسة:
 * «ارفع العنوان دا فوق شوية، وتفاصيل العميل والتاريخ ارفعهم برضو». فتفرّغ
 * نحو أربعين بكسلاً فوق الجدول — تكفي صفّاً إضافيّاً وزيادةً في الخطّ معاً.
 *
 * يحرسه `printRowsPerPage.test.ts` بتصييرٍ حقيقي: يعدّ ما يقع فوق حدّ
 * الصفحة، فلا يكفي أن تُكتب الأرقام هنا.
 */
export const ROWS_PER_PAGE_TARGET = 30;

/**
 * الدرجة من عدد بنود المستند وبنود التغليف.
 *
 * المدخلات تُصان: قيمةٌ سالبةٌ أو غير رقمية تُقرأ صفراً، فلا تنقلب فاتورةٌ
 * صغيرةٌ كثيفةً بسبب حقلٍ فارغ.
 */
export function printDensity(itemCount: unknown, packagingRows: unknown = 0): PrintDensity {
  const safe = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const lines = safe(itemCount) + safe(packagingRows);
  if (lines > DENSE_AT) return "dense";
  if (lines > COMPACT_AT) return "compact";
  return "normal";
}

/** صنف CSS يُوضع على `.page` — `normal` بلا صنفٍ كي لا يتغيّر المألوف. */
export function densityClass(d: PrintDensity): string {
  return d === "normal" ? "" : `d-${d}`;
}

/**
 * قواعد الكثافة، مكتوبةً مرّةً واحدة لتُحقن في القالب.
 *
 * كلُّ مقاسٍ هنا ≥ `MIN_FONT_PX` — وهو ما يفحصه الاختبار على النصّ نفسه، لا
 * على نيّة كاتبه.
 */
export const DENSITY_CSS = `
  /* === كثافة تلقائية: فاتورةٌ كبيرة تضغط نفسها، ولا تُخفي شيئاً ===
     المساحةُ تُؤخذ من الترويسة لا من الخطّ: رفعُ العنوان وبيانات العميل
     والتاريخ يفرّغ نحو أربعين بكسلاً فوق الجدول، فيتّسع صفٌّ إضافيّ ويكبر
     الخطُّ معاً. راجع ROWS_PER_PAGE_TARGET. */
  .d-compact .header { padding-bottom: 5px; margin-bottom: 5px; }
  .d-compact .header-logo img { height: 58px; }
  .d-compact .doc-title { margin: 4px 0 5px; }
  .d-compact .doc-title h1 { font-size: 19px; }
  .d-compact .info-row { margin-bottom: 5px; }
  .d-compact thead th { padding: 4px 6px; font-size: 12px; }
  .d-compact tbody td { padding: 3.5px 6px; font-size: 12.5px; }
  .d-compact .total-row td { font-size: 12.5px; }
  .d-compact .extra-content table td, .d-compact .extra-content table th { font-size: 11px; padding: 3px 5px; }

  .d-dense .header { padding-bottom: 4px; margin-bottom: 4px; }
  .d-dense .header-logo img { height: 46px; }
  .d-dense .header-title { font-size: 18px; }
  .d-dense .doc-title { margin: 3px 0 4px; }
  .d-dense .doc-title h1 { font-size: 17px; }
  .d-dense .info-row { margin-bottom: 4px; font-size: 12px; }
  .d-dense thead th { padding: 3px 5px; font-size: 11.5px; }
  .d-dense tbody td { padding: 2.5px 5px; font-size: 11.5px; }
  .d-dense .total-row td { font-size: 12px; }
  .d-dense .extra-content table td, .d-dense .extra-content table th { font-size: 10.5px; padding: 2px 4px; }
  .d-dense .signatures { padding: 10px 50px 6px; margin-top: 10px; }
  .d-dense .sig-line { margin-top: 28px; }
`;
