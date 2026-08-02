/**
 * منطق موحّد لفلترة اقتراحات المنتجات في شاشات إنشاء عرض السعر والفاتورة.
 *
 * القواعد:
 * - بحث فارغ ⇒ لا اقتراحات.
 * - فلتر اختياري بحسب المخزن (warehouseId) — يُطبَّق فقط إذا مُرِّر.
 * - إزالة التكرار بحسب id (نفس المنتج لا يظهر مرتين).
 * - حد أقصى 10 نتائج.
 *
 * ## الترتيب: ما يبدأ بالاسم أولاً
 * `startsWithAny` تطابق **بداية أي كلمة** داخل الاسم، فكتابة «اس» كانت تُظهر
 * «بوري اسود» بجوار «اسمنت» بلا ترتيب — فيبحث المستخدم عن مبتغاه في قائمةٍ
 * نصفُها لا يبدأ بما كتب.
 *
 * فصارت النتائج مرتّبة: **ما يبدأ اسمه (أو رمزه) بالمكتوب أولاً**، ثم ما يطابق
 * على بداية كلمةٍ داخله. ولا تسقط الثانية — منتجٌ اسمه «بوري شطط 50» يجب أن
 * يُوجَد بكتابة «شطط»، وإسقاطها يُخفيه عمّن لا يحفظ أول كلمة في الاسم.
 *
 * ملاحظة: لا نستبعد المنتجات المُضافة فعلياً إلى الصفوف، حتى يبقى البحث
 * "حيّاً" ويستطيع المستخدم تأكيد وجوده — وتظهر له رسالة "مُضاف مسبقاً"
 * عند المحاولة فعلياً (يُتعامَل معها في pickProductIntoRow).
 */
import { startsWithAny, normalizeAr } from "./searchMatch";

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
  const q = normalizeAr(query);
  /** يبدأ الاسم أو الرمز نفسه بالمكتوب — لا بداية كلمةٍ في وسطه. */
  const leads = (p: T) =>
    normalizeAr(p.name).startsWith(q) || normalizeAr(p.sku).startsWith(q);

  const seen = new Set<string>();
  const matched = products
    .filter((p) => !warehouseId || p.warehouse_id === warehouseId)
    .filter((p) => startsWithAny([p.name, p.sku], query))
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

  // ترتيب ثابت لا يُعيد ترتيب المتساويين — فلا تقفز النتائج بين ضغطتين.
  const head = matched.filter(leads);
  const tail = matched.filter((p) => !leads(p));
  return [...head, ...tail].slice(0, 10);
}
