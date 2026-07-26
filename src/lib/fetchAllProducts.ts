import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

/**
 * يجلب كل المنتجات من قاعدة البيانات بدون التأثر بحدّ Supabase الافتراضي
 * (1000 صف لكل استعلام) عبر التقسيم بـ range() حتى انتهاء البيانات.
 *
 * يستخدم في شاشات الإنشاء (الفاتورة/عرض السعر/أمر الشراء/مرتجع المخزون)
 * لضمان أن قائمة البحث تطابق فعلياً جميع المنتجات في قاعدة البيانات.
 */
export async function fetchAllProducts<T = any>(
  columns = "*",
  orderBy: { column: string; ascending?: boolean } = { column: "name", ascending: true },
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from("products")
      .select(columns)
      .order(orderBy.column, { ascending: orderBy.ascending ?? true, nullsFirst: false })
      .range(from, to);
    if (error) throw error;
    const rows = (data || []) as unknown as T[];
    all.push(...rows);
    if (rows.length < PAGE) break; // وصلنا لآخر دفعة
  }
  return all;
}

// ---------------------------------------------------------------------------
// نسخة مُجمِّعة لمعالجات الأحداث (products:changed / window focus):
// كل حفظ فاتورة كان يجعل كل صفحة إنشاء مفتوحة تعيد تنزيل جدول المنتجات كاملاً،
// ويتضاعف الجلب عند تزامن الحدث مع العودة للتبويب. هنا:
//   • مشاركة الطلب الجاري: نداءات متزامنة لنفس الأعمدة تتشارك Promise واحداً.
//   • نافذة تبريد: خلال COOLDOWN_MS بعد آخر جلب يُجدْوَل تنفيذ متأخر واحد
//     عند نهايتها (لا يضيع التحديث — يتأخر ثوانيَ فقط بدل عاصفة طلبات).
// التحميل الأولي للصفحات يبقى عبر fetchAllProducts مباشرة (حداثة مضمونة).
// ---------------------------------------------------------------------------
const COOLDOWN_MS = 15_000;
type CoState = { at: number; inflight: Promise<unknown> | null; trailing: ReturnType<typeof setTimeout> | null };
const coStates = new Map<string, CoState>();

export function fetchAllProductsCoalesced<T = any>(columns = "*"): Promise<T[]> {
  let s = coStates.get(columns);
  if (!s) { s = { at: 0, inflight: null, trailing: null }; coStates.set(columns, s); }
  if (s.inflight) return s.inflight as Promise<T[]>;

  const run = (): Promise<T[]> => {
    s!.at = Date.now();
    const p = fetchAllProducts<T>(columns).finally(() => { s!.inflight = null; });
    s!.inflight = p;
    return p;
  };

  const since = Date.now() - s.at;
  if (since >= COOLDOWN_MS) return run();

  const pending = new Promise<T[]>((resolve, reject) => {
    s!.trailing = setTimeout(() => {
      s!.trailing = null;
      s!.inflight = null;
      run().then(resolve, reject);
    }, COOLDOWN_MS - since);
  });
  s.inflight = pending;
  return pending;
}
