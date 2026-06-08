import { normalizeAr } from "./arabicNormalize";

/**
 * منطق موحّد لفلترة اقتراحات المنتجات في شاشات إنشاء عرض السعر والفاتورة.
 *
 * القواعد:
 * - بحث فارغ ⇒ لا اقتراحات.
 * - مطابقة بعد تطبيع النص العربي (أ/إ/آ، ى/ي، ة/ه، التشكيل) على الاسم أو الـ SKU.
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
  is_frozen?: boolean | null;
}

export function productMatches<T extends ProductLike>(
  products: T[],
  query: string,
  warehouseId?: string | null,
  opts?: { excludeFrozen?: boolean },
): T[] {
  if (!query.trim()) return [];
  const q = normalizeAr(query);
  if (!q) return [];
  const seen = new Set<string>();
  return products
    .filter((p) => !opts?.excludeFrozen || !p.is_frozen)
    .filter((p) => !warehouseId || p.warehouse_id === warehouseId)
    .filter((p) => normalizeAr(p.name).includes(q) || normalizeAr(p.sku || "").includes(q))
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 10);
}
