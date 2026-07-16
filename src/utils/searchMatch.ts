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
  // fuzzy fallback: tolerate single typo (insert/delete/replace) أو تبادل حرفين
  if (q.length >= 3) {
    for (const f of fields) if (fuzzyMatch(f, q, 1)) return true;
  }
  return false;
}

/**
 * مسافة تحرير Damerau-Levenshtein (مع تبادل حرفين متجاورين كخطوة واحدة).
 * تُستخدم لتحمل الأخطاء الإملائية البسيطة في البحث.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/**
 * مطابقة مبنية على مسافة تحرير — للأسماء الجزئية مع تحمّل خطأ إملائي واحد
 * أو تبادل ترتيب حرفين متجاورين. تُقارن ضد نافذة بطول الاستعلام من بداية
 * النص وكل توكن، لتفادي مطابقة النصوص الطويلة بالخطأ.
 */
export function fuzzyMatch(haystack: unknown, query: unknown, maxDist = 1): boolean {
  const q = normalizeAr(query);
  if (!q) return true;
  const h = normalizeAr(haystack);
  if (!h) return false;
  if (damerauLevenshtein(h.slice(0, q.length), q) <= maxDist) return true;
  for (const t of h.split(" ")) {
    if (!t) continue;
    if (damerauLevenshtein(t.slice(0, q.length), q) <= maxDist) return true;
  }
  return false;
}

