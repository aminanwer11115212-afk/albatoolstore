/**
 * رسومُ الورقة السطرية — **تعريفٌ واحد** يستورده الطرفان.
 *
 * يستورده `src/utils/printTemplate.ts` (الطباعة والمعاينة وواتساب PDF)
 * وقالبُ الرابط العام `document-share/template.ts`. ومكانُه `_shared` لأن
 * دالّة الحافّة لا تصل إلى `src/`، وVite لا يمانع الوصول إلى `supabase/`.
 *
 * ## العطل الذي عالجه
 * الرسومُ كانت في قالب الطباعة وحده، وقالبُ الرابط العام بلا رسمٍ واحد. فيرى
 * صاحبُ المحلّ في معاينته عمودَ علامات مربّع الحساب — ورقةً للقيمة وساعةً
 * للقديم وآلةَ حسابٍ للجملة ومالاً للمدفوع ومحفظةً للرصيد — وترويسةً فيها
 * هاتفٌ ومسؤولٌ وموقع، ثم يفتح العميل رابطَه فلا يجد منها شيئاً.
 *
 * ## ولماذا رسومٌ سطرية لا إيموجي
 * الإيموجي يُرسم بخطٍّ ملوّنٍ غيرِ مضمونٍ في المصوِّر (html2canvas) ولا في
 * سائقات الطباعة — فيخرج مربّعاً فارغاً في ملفّ العميل على بعض الأجهزة، وهو
 * ما لا يُكتشف إلا عنده. والرسمُ بـcurrentColor يرث لونَ عنوانه، فلا لونَ
 * يُكتب مرّتين، ويطبع بأيّ حبر.
 *
 * ## ولا علامةَ backtick هنا
 * الملفّان المستوردان لهذا يبنيان سلاسلَ نصّية طويلة، والعلامةُ داخل تعليقٍ
 * أو وسمٍ تنهي السلسلة فيسقط التصريف على سطرٍ لا علاقة له بالعلّة.
 */

export const SVG_TRUCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M1 3h11v13H1z"/><path d="M12 8h4.5L21 12v4h-9z"/>'
  + '<circle cx="6" cy="19" r="2"/><circle cx="17.5" cy="19" r="2"/></svg>';

export const SVG_BOX =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5"/>'
  + '<path d="M12 12v9"/></svg>';

export const SVG_PHONE =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0'
  + ' 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0'
  + ' 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z"/></svg>';

export const SVG_USER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

export const SVG_PIN =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<path d="M12 2a7 7 0 0 0-7 7c0 5.1 7 13 7 13s7-7.9 7-13a7 7 0 0 0-7-7zm0 9.5A2.5'
  + ' 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

/*
 * والمصافحةُ رُسمت مرّتين: أوّلُ مسارٍ خرج خربشةً لا تُعرف عند 18px — جُرّب
 * بالتصيير ورُئي. فحلّ محلَّه هذا: أصابعُ اليد اليمنى ومعصمُها وكمّا الذراعين
 * مسارات مفصولة، فيبقى الشكلُ مقروءاً في المقاس الصغير الذي يُطبع به.
 */
export const SVG_HANDSHAKE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="m11 17 2 2a1 1 0 1 0 3-3"/>'
  + '<path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3'
  + 'l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a2 2 0 0 0 1.4.2L21 4"/>'
  + '<path d="m21 3 1 11h-2"/>'
  + '<path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/>'
  + '<path d="M3 4h8"/></svg>';

/**
 * ## علاماتُ صفوف مربّع الحساب
 *
 * أرسل صاحبُ المستودع صورةَ المربّع وقد أحاط بعمود العلامات: لكلّ صفٍّ علامتُه
 * إلى يمينه — ورقةٌ للقيمة، وساعةٌ للقديم، وآلةُ حسابٍ للجملة، ومالٌ للمدفوع،
 * ومحفظةٌ للرصيد. فالعينُ تجد الصفَّ بشكله قبل أن تقرأ اسمه، وهو مربّعٌ
 * يُقرأ في عجلة.
 *
 * ورسومٌ سطرية لا إيموجي، للسبب نفسِه الذي في رسوم الترويسة: الإيموجي يُرسم
 * بخطٍّ ملوّنٍ غيرِ مضمونٍ في المصوِّر ولا في المطبعة فيخرج مربّعاً فارغاً.
 */
export const ACCT_ICON_COLOR = "#1f5c43";

export const SVG_FILE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/>'
  + '<path d="M14 2v5h5"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>';

export const SVG_CLOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/></svg>';

export const SVG_CALC =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/>'
  + '<path d="M8 11h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/>'
  + '<path d="M8 15h.01"/><path d="M12 15h.01"/><path d="M16 15h.01"/>'
  + '<path d="M8 19h.01"/><path d="M12 19h.01"/><path d="M16 19h.01"/></svg>';

export const SVG_CASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<rect x="2" y="6" width="20" height="12" rx="2"/>'
  + '<circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>';

export const SVG_WALLET =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1"/>'
  + '<path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>'
  + '<path d="M21 10h-4a2 2 0 0 0 0 4h4z"/></svg>';

export const SVG_TAG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M20.6 13.4 12 22 2 12V2h10z"/><path d="M7.5 7.5h.01"/></svg>';
