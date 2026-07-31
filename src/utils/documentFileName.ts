/**
 * اسم موحّد لكل ملفات المستندات المُصدَّرة (PDF/صور).
 *
 * الشكل: «نوع المستند - اسم العميل - رقم المستند - المبلغ»
 *   فاتورة مبيعات - أمين اسماعيل - INV-93158 - 126,000.pdf
 *
 * كل مسار يُنتج ملفاً للعميل يمرّ من هنا: زر تحميل PDF في المعاينة، مشاركة
 * الواتساب، وصفحة رابط المشاركة التي يفتحها العميل بنفسه — فلا يصل إليه ملف
 * باسم عام مثل `document-a1b2c3d4.pdf` لا يدلّ على شيء.
 */

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/**
 * محارف تحكّم اتجاه النص وعرض صفري.
 *
 * لا تُرى على الشاشة لكنها بايتات حقيقية في اسم الملف، فتظهر في واتساب
 * وفي مدير الملفات على شكل رموز غريبة أو تقلب ترتيب الاسم. تتسلّل من نسخ
 * أسماء العملاء من مصادر عربية (لوحات المفاتيح، Word، الويب).
 */
const BIDI_AND_INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g;

/** ينظّف جزءاً من اسم الملف: أرقام لاتينية، بلا محارف ممنوعة، بلا قيم نائبة. */
export function cleanNamePart(raw: unknown): string {
  let s = String(raw ?? "").trim();
  if (!s || s === "-" || s === "—" || s === "_" || s === "undefined" || s === "null") return "";
  // توحيد الشكل (NFC): الحرف العربي المركّب يصير محرفاً واحداً بدل حرف + علامة،
  // فلا يختلف اسم الملف بين جهاز وآخر ولا تُقطَّع علاماته عند النقل.
  try { s = s.normalize("NFC"); } catch { /* بيئة بلا normalize */ }
  s = s.replace(BIDI_AND_INVISIBLE, "");
  s = s.replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] || d);
  // محارف ممنوعة في أسماء الملفات على Windows/macOS/Linux
  s = s.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** المبلغ بفواصل الآلاف — يُهمَل إن كان صفراً أو غير صالح. */
export function formatAmountPart(total: unknown): string {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.round(n * 100) / 100 === Math.round(n)
    ? Math.round(n).toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export interface DocFileNameParts {
  /** نوع المستند: «فاتورة مبيعات» / «عرض سعر» / «كشف حساب عميل» */
  docLabel?: unknown;
  customerName?: unknown;
  docNumber?: unknown;
  /** إجمالي المستند — يُضاف آخر الاسم */
  total?: unknown;
  /** امتداد بلا نقطة (افتراضي pdf) */
  ext?: string;
}

/** يبني اسم الملف الكامل من أجزائه، مع تجاهل الأجزاء الفارغة. */
export function buildDocumentFileName(parts: DocFileNameParts): string {
  const ext = parts.ext || "pdf";
  const chunks = [
    cleanNamePart(parts.docLabel),
    cleanNamePart(parts.customerName),
    cleanNamePart(parts.docNumber),
    formatAmountPart(parts.total),
  ].filter(Boolean);

  let name = chunks.join(" - ").trim();
  if (!name) name = "مستند";
  // حدّ آمن لأسماء الملفات
  if (name.length > 120) name = name.slice(0, 120).trim();
  return `${name}.${ext}`;
}
