/**
 * حساب الكمية المتاحة للعرض في قائمة اقتراحات المنتجات داخل شاشات الإنشاء
 * (الفاتورة وعرض السعر) بحيث تعكس ما تبقى فعلياً بعد طرح الكميات المضافة
 * في صفوف المستند الحالي.
 *
 * مرتجع المخزون والمشتريات لا يحتاجان للاستدعاء — كلاهما يُضيف للمخزون،
 * فالكمية المعروضة تبقى هي قيمة `stock_quantity` الخام.
 */
export interface RowLike {
  uid?: string;
  product_id: string | null;
  quantity: number | null | undefined;
}

export function getAvailableStock(
  product: { id: string; stock_quantity?: number | null },
  rows: RowLike[] | null | undefined,
  excludeRowUid?: string | null,
): number {
  const base = Number(product?.stock_quantity || 0);
  if (!rows || rows.length === 0) return base;
  let used = 0;
  for (const r of rows) {
    if (!r || r.product_id !== product.id) continue;
    if (excludeRowUid && r.uid === excludeRowUid) continue;
    used += Number(r.quantity || 0);
  }
  return base - used;
}
