/**
 * أدوات بحث موحَّدة لكامل النظام.
 *
 * القاعدة:
 * - "يبدأ بـ" (startsWith) على بداية أيّ كلمة داخل الحقل (token startsWith).
 * - تطبيع عربي: إزالة التشكيل، توحيد الألف والياء والتاء المربوطة، تحويل لأحرف صغيرة.
 * - بحث فارغ ⇒ مطابقة دائماً (true).
 */

/** تطبيع نص للمقارنة (عربي + إنجليزي). */
export function normalizeAr(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // إزالة التشكيل
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[_\-\/\\.،,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * يُرجِع true إذا haystack يبدأ بـ query (بعد التطبيع) — على مستوى النص
 * كاملاً أو على بداية أي كلمة داخله (token startsWith).
 * بحث فارغ ⇒ true دائماً.
 */
export function startsWithMatch(haystack: unknown, query: unknown): boolean {
  const q = normalizeAr(query);
  if (!q) return true;
  const h = normalizeAr(haystack);
  if (!h) return false;
  if (h.startsWith(q)) return true;
  const tokens = h.split(" ");
  for (const t of tokens) {
    if (t && t.startsWith(q)) return true;
  }
  return false;
}


/** يُرجِع true إذا أي حقل من الحقول يطابق startsWithMatch. */
export function startsWithAny(fields: Array<unknown>, query: unknown): boolean {
  const q = normalizeAr(query);
  if (!q) return true;
  for (const f of fields) {
    if (startsWithMatch(f, q)) return true;
  }
  return false;
}

/** مساعد لفلترة قائمة بسهولة بناءً على دالة استخراج حقول. */
export function filterByStartsWith<T>(
  items: T[],
  getFields: (item: T) => Array<unknown>,
  query: unknown,
): T[] {
  const q = normalizeAr(query);
  if (!q) return items;
  return items.filter((it) => startsWithAny(getFields(it), q));
}

/**
 * مطابقة "يحتوي" ذكية — بعد التطبيع العربي (يتعامل مع أ/إ/آ/ي/ى/ة/ه، التشكيل،
 * وحالة الأحرف). أفضل من startsWith للبحث عن اسم جزئي أو أحرف متشابهة.
 * بحث فارغ ⇒ true دائماً.
 */
export function containsMatch(haystack: unknown, query: unknown): boolean {
  const q = normalizeAr(query);
  if (!q) return true;
  const h = normalizeAr(haystack);
  if (!h) return false;
  if (h.includes(q)) return true;
  // مطابقة كلمة بكلمة كذلك — تحمي من اختلاف ترتيب الكلمات
  const tokens = h.split(" ");
  for (const t of tokens) if (t && t.includes(q)) return true;
  return false;
}

/** يُرجِع true إذا أي حقل من الحقول يطابق containsMatch. */
export function containsAny(fields: Array<unknown>, query: unknown): boolean {
  const q = normalizeAr(query);
  if (!q) return true;
  for (const f of fields) if (containsMatch(f, q)) return true;
  return false;
}

