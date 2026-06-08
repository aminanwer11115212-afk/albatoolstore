import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

/**
 * يجلب كل الموردين من قاعدة البيانات بدون التأثر بحدّ Supabase الافتراضي
 * (1000 صف لكل استعلام) عبر التقسيم بـ range() حتى انتهاء البيانات.
 *
 * يستخدم في شاشة المشتريات وشاشة إدارة الموردين لضمان أن قائمة البحث
 * تطابق فعلياً جميع الموردين في قاعدة البيانات.
 */
export async function fetchAllSuppliers<T = any>(
  columns = "*",
  orderBy: { column: string; ascending?: boolean } = { column: "created_at", ascending: false },
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from("suppliers")
      .select(columns)
      .order(orderBy.column, { ascending: orderBy.ascending ?? false, nullsFirst: false })
      .order("id", { ascending: orderBy.ascending ?? false })
      .range(from, to);
    if (error) throw error;
    const rows = (data || []) as unknown as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}
