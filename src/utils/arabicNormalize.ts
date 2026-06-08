/**
 * تطبيع النصوص العربية لأغراض البحث.
 * - تحويل أحرف العربية المتشابهة لشكل موحد (أ/إ/آ → ا، ى → ي، ة → ه).
 * - إزالة التشكيل.
 * - تطبيع الفراغات.
 * - تحويل لحالة الأحرف الصغيرة (للنص اللاتيني المختلط).
 *
 * مكان الاستخدام: كل دوال بحث العملاء/الموردين/المنتجات في شاشات الإنشاء،
 * بحيث يطابق المستخدم اسماً سواء كتبه "احمد" أو "أحمد" أو "أَحْمَد".
 */
export function normalizeAr(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "") // التشكيل
    .replace(/[إأآٱا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** هل يحتوي النص (بعد التطبيع) على نص البحث (بعد التطبيع)؟ */
export function arIncludes(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const q = normalizeAr(needle);
  if (!q) return false;
  return normalizeAr(haystack).includes(q);
}
