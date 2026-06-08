import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

/**
 * يجلب كل العملاء من قاعدة البيانات بدون التأثر بحدّ Supabase الافتراضي
 * (1000 صف لكل استعلام) عبر التقسيم بـ range() حتى انتهاء البيانات.
 *
 * يستخدم في شاشات الإنشاء (الفاتورة/عرض السعر/مرتجع المخزون) وفي صفحة
 * إدارة العملاء لضمان أن قائمة البحث تطابق فعلياً جميع العملاء.
 */
export async function fetchAllCustomers<T = any>(
  columns = "*",
  orderBy: { column: string; ascending?: boolean } = { column: "name", ascending: true },
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from("customers")
      .select(columns)
      .order(orderBy.column, { ascending: orderBy.ascending ?? true, nullsFirst: false })
      .order("id", { ascending: orderBy.ascending ?? true })
      .range(from, to);
    if (error) throw error;
    const rows = (data || []) as unknown as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}
