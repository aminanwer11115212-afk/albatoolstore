/**
 * useMessageImport — منطق تحليل رسائل العملاء وتحويلها إلى بنود.
 *
 * الخوارزمية:
 * 1. تقسيم النص إلى أسطر.
 * 2. لكل سطر: استخراج الكمية (رقم في البداية أو النهاية) ونص المنتج.
 * 3. مطابقة تقريبية fuzzy بين نص المنتج وقائمة المنتجات الموجودة.
 * 4. إرجاع قائمة من { product, qty, rawLine, matched } للعرض قبل التطبيق.
 */

export interface ProductLike {
  id: string;
  name: string;
  sale_price?: number | null;
  foreign_price?: number | null;
  unit?: string | null;
  warehouse_id?: string | null;
}

export interface ParsedLine {
  rawLine: string;
  productText: string;
  qty: number;
  matched: ProductLike | null;
  /** درجة التشابه 0-1 */
  score: number;
}

// ─── normaliser ──────────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[يىئ]/g, "ي")
    .replace(/[ؤو]/g, "و")
    .replace(/[\u064B-\u065F]/g, "") // حركات
    .replace(/[^\u0600-\u06FF\u0041-\u007A\u0030-\u0039]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ─── Jaro-Winkler similarity ──────────────────────────────────────────────────
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  if (!l1 || !l2) return 0;
  const matchDist = Math.floor(Math.max(l1, l2) / 2) - 1;
  const s1m = new Array(l1).fill(false);
  const s2m = new Array(l2).fill(false);
  let matches = 0, t = 0;
  for (let i = 0; i < l1; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, l2);
    for (let j = lo; j < hi; j++) {
      if (!s2m[j] && s1[i] === s2[j]) {
        s1m[i] = true; s2m[j] = true; matches++; break;
      }
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (s1m[i]) {
      while (!s2m[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
  }
  const j = (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3;
  const pre = Math.min(
    [...s1].findIndex((c, i) => c !== s2[i]) === -1 ? Math.min(l1, l2) : [...s1].findIndex((c, i) => c !== s2[i]),
    4,
  );
  return j + pre * 0.1 * (1 - j);
}

// ─── Token-based similarity ───────────────────────────────────────────────────
function tokenScore(query: string, candidate: string): number {
  const qTokens = query.split(" ").filter(Boolean);
  const cTokens = candidate.split(" ").filter(Boolean);
  if (!qTokens.length || !cTokens.length) return 0;

  // Prefix match boost: if candidate starts with query
  if (candidate.startsWith(query)) return 1;
  if (candidate.includes(query)) return 0.95;

  // Token overlap
  let overlap = 0;
  for (const qt of qTokens) {
    for (const ct of cTokens) {
      const sc = jaro(qt, ct);
      if (sc > 0.85) { overlap += sc; break; }
    }
  }
  const tokenRatio = overlap / Math.max(qTokens.length, cTokens.length);

  // Full-string jaro
  const fullJ = jaro(query, candidate);

  return Math.max(tokenRatio, fullJ);
}

// ─── Parse one line ───────────────────────────────────────────────────────────
/** 
 * يستخرج رقم الكمية ونص المنتج من سطر.
 * دعم الصيغ: "لحم ضأن × 5", "5 كيلو لحم", "لحم ضأن 3", "لحم ضأن x3", "- لحم ضأن 2"
 */
export function parseLine(line: string): { productText: string; qty: number } | null {
  const s = line
    .replace(/^[-–•*#\s]+/, "")   // إزالة البادئات الترميزية
    .replace(/[×xX]\s*/g, " ")    // × و x → مسافة
    .replace(/[:ـ]/g, " ")
    .trim();

  if (!s) return null;

  // كمية في البداية (ارقام عربية أو لاتينية + وحدة اختيارية)
  const startQty = s.match(/^(\d+(?:\.\d+)?)\s*(كيلو|كغ|kg|حبة|قطعة|لتر|علبة|كرتون|كيس|صحن|طن)?\s+(.+)/i);
  if (startQty) {
    return { productText: startQty[3].trim(), qty: parseFloat(startQty[1]) };
  }

  // كمية في النهاية
  const endQty = s.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(كيلو|كغ|kg|حبة|قطعة|لتر|علبة|كرتون|كيس|صحن|طن)?$/i);
  if (endQty) {
    return { productText: endQty[1].trim(), qty: parseFloat(endQty[2]) };
  }

  // لا كمية → كمية = 1
  return { productText: s, qty: 1 };
}

// ─── Main export ──────────────────────────────────────────────────────────────
const MIN_SCORE = 0.45; // أدنى درجة مطابقة مقبولة

export function parseMessage(
  text: string,
  products: ProductLike[],
  warehouseId?: string | null,
): ParsedLine[] {
  const lines = text
    .split(/[\n,،;؛]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((rawLine) => {
    const parsed = parseLine(rawLine);
    if (!parsed) return { rawLine, productText: rawLine, qty: 1, matched: null, score: 0 };

    const { productText, qty } = parsed;
    const qNorm = normalize(productText);

    let best: ProductLike | null = null;
    let bestScore = 0;

    const pool = warehouseId
      ? products.filter((p) => !p.warehouse_id || p.warehouse_id === warehouseId)
      : products;

    for (const p of pool) {
      const sc = tokenScore(qNorm, normalize(p.name));
      if (sc > bestScore) { bestScore = sc; best = p; }
    }

    return {
      rawLine,
      productText,
      qty,
      matched: bestScore >= MIN_SCORE ? best : null,
      score: bestScore,
    };
  });
}
