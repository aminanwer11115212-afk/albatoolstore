/**
 * منطق موحّد لفلترة اقتراحات المنتجات في شاشات إنشاء عرض السعر والفاتورة.
 *
 * القواعد:
 * - بحث فارغ ⇒ لا اقتراحات.
 * - بحث على بداية اسم المنتج (startsWith) — غير حسّاس لحالة الأحرف.
 * - فلتر اختياري بحسب المخزن (warehouseId) — يُطبَّق فقط إذا مُرِّر.
 * - إزالة التكرار بحسب id (نفس المنتج لا يظهر مرتين).
 * - حد أقصى 10 نتائج.
 *
 * ملاحظة: لا نستبعد المنتجات المُضافة فعلياً إلى الصفوف، حتى يبقى البحث
 * "حيّاً" ويستطيع المستخدم تأكيد وجوده — وتظهر له رسالة "مُضاف مسبقاً"
 * عند المحاولة فعلياً (يُتعامَل معها في pickProductIntoRow).
 */
export interface ProductLike {
  id: string;
  name: string;
  sku?: string | null;
  warehouse_id?: string | null;
}

export function productMatches<T extends ProductLike>(
  products: T[],
  query: string,
  warehouseId?: string | null,
): T[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const seen = new Set<string>();
  return products
    .filter((p) => !warehouseId || p.warehouse_id === warehouseId)
    .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 10);
}
