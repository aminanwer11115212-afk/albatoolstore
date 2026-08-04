/**
 * تفضيلات أعمدة صفحة إدارة المنتجات — نفس منظومة صفحة العملاء بالضبط.
 *
 * طلبها صاحب المستودع: «أضف زر إخفاء الأعمدة في المنتجات مثل الذي في
 * العملاء». والمنطق مشتركٌ في `useTableColsPref` فلا نسخةَ ثانية منه.
 *
 * الأعمدة الطرفية (# للفهرس + الإعدادات) ثابتة: بلا الفهرس يضيع العدّ، وبلا
 * الإعدادات لا يبقى للصف زرٌّ يُفتح منه.
 */
import { useTableColsPref } from "@/hooks/useTableColsPref";

export const PRODUCTS_MIDDLE_KEYS = [
  "name",
  "image",
  "category",
  "brand",
  "warehouse",
  "price",
  "foreign_price",
  "supplier",
  "frozen",
] as const;

export type ProductColKey = (typeof PRODUCTS_MIDDLE_KEYS)[number];

export const PRODUCTS_COL_LABELS: Record<ProductColKey, string> = {
  name: "اسم المنتج",
  image: "الصورة",
  category: "الفئة",
  brand: "الماركة",
  warehouse: "المستودع",
  price: "السعر",
  foreign_price: "السعر الأجنبي",
  supplier: "المورّد",
  frozen: "تجميد",
};

export function useProductColsPref() {
  return useTableColsPref<ProductColKey>({
    screen: "products",
    keys: PRODUCTS_MIDDLE_KEYS,
    labels: PRODUCTS_COL_LABELS,
    toastId: "product-cols-saved",
  });
}
