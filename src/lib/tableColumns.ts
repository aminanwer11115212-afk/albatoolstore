/**
 * فحص ديناميكي لوجود أعمدة في جداول قاعدة البيانات.
 * يمنع فشل الاستعلامات بصمت عند الإشارة لعمود غير موجود
 * (مثل packaging_total_pieces في تقرير الترحيلات).
 *
 * - النتائج مُخزّنة في الذاكرة طوال عمر الجلسة (per table).
 * - عند فشل الفحص → نعود إلى true (لا نُعيق الاستعلام).
 */
import { supabase } from "@/integrations/supabase/client";

type ColSet = Set<string>;
const cache = new Map<string, Promise<ColSet>>();

async function fetchColumns(table: string): Promise<ColSet> {
  try {
    // probe بسيط: نطلب صفاً واحداً ونلتقط أسماء الأعمدة من المفاتيح
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .limit(1);
    if (error) return new Set();
    const row = (data || [])[0];
    if (!row) {
      // الجدول فارغ — لا يمكن استنتاج الأعمدة، نُعيد set فارغة
      // ونعتبر أن أي فحص لاحق سيُرجع false إلا إذا تم تحديثه يدوياً.
      return new Set();
    }
    return new Set(Object.keys(row));
  } catch {
    return new Set();
  }
}

export function getTableColumns(table: string): Promise<ColSet> {
  let p = cache.get(table);
  if (!p) {
    p = fetchColumns(table);
    cache.set(table, p);
  }
  return p;
}

/**
 * يُرجع true إذا كان العمود موجوداً، أو إذا تعذّر التحقق
 * (لكي لا نعطّل استعلاماً سليماً عند جدول فارغ مثلاً).
 */
export async function hasColumn(table: string, column: string): Promise<boolean> {
  const cols = await getTableColumns(table);
  if (cols.size === 0) return false; // لا نملك دليلاً → نتعامل بحذر
  return cols.has(column);
}

/**
 * يُصفّي قائمة أعمدة select بحيث يُبقي فقط الموجود فعلياً في الجدول.
 * يَقبل الصيغة المُعتادة لـ PostgREST (يفهم العلاقات `relation(...)` ويتركها كما هي).
 */
export async function filterSelectColumns(
  table: string,
  selectExpr: string,
): Promise<string> {
  const cols = await getTableColumns(table);
  if (cols.size === 0) return selectExpr; // غير معروف → لا نتدخل
  const parts = splitTopLevel(selectExpr);
  const kept = parts.filter((raw) => {
    const token = raw.trim();
    if (!token) return false;
    // علاقة متداخلة: `name(...)` → نُبقيها دائماً
    if (/^[a-zA-Z_][\w]*\s*\(/.test(token)) return true;
    // alias أو cast → نأخذ الجزء الأول قبل ':' أو '::' أو مسافة
    const baseName = token.split(":")[0].split("::")[0].trim();
    return cols.has(baseName);
  });
  return kept.join(", ");
}

/** يُقسّم تعبير select على الفواصل في المستوى الأعلى فقط (يتجاهل ما بين الأقواس). */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}
