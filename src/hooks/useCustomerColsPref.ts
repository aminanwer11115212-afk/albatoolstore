/**
 * تفضيلات أعمدة صفحة إدارة العملاء — غلافٌ فوق `useTableColsPref`.
 *
 * كان المنطق مكتوباً هنا كاملاً، ولمّا طُلب الشيءُ نفسه في صفحة المنتجات
 * استُخرج إلى مصدرٍ واحد عامّ. وبقي هذا الملف بواجهته كما هي — لا تتغيّر
 * الشاشة ولا مفتاح التخزين ولا التفضيلات المحفوظة للمستخدمين.
 */
import { useTableColsPref, tableColsStorageKey } from "@/hooks/useTableColsPref";
import type { FormFactor } from "@/hooks/useFormFactor";

export const CUSTOMERS_MIDDLE_KEYS = [
  "name",
  "address",
  "phone",
  "region",
  "state",
  "city",
  "locality",
  "group",
  "transporter",
  "destination",
] as const;

export type CustomerColKey = (typeof CUSTOMERS_MIDDLE_KEYS)[number];

export const CUSTOMERS_COL_LABELS: Record<CustomerColKey, string> = {
  name: "اسم العميل",
  address: "العنوان",
  phone: "واتساب / الهاتف",
  region: "الاتجاه",
  state: "الولاية",
  city: "المدينة",
  locality: "المحلية",
  group: "المجموعة",
  transporter: "الترحيلات",
  destination: "الوجهة",
};

export function customerColsStorageKey(uid: string, ff: FormFactor): string {
  return tableColsStorageKey("customers", uid, ff);
}

/**
 * مفاتيح قديمة قد تحمل تفضيلات المستخدم قبل الفصل بين الموبايل والديسكتوب.
 * تُرقَّى بصمت عند غياب المفتاح الحالي — دون حذف الأصل ليظلّ قابلاً للاستعادة.
 */
function legacyKeys(uid: string): string[] {
  return [
    `lov:u:${uid}:customers:cols`,
    `lov:u:${uid}:legacy:customers:cols`,
    `customers:cols`,
    `lov:customers:cols`,
  ];
}

export function useCustomerColsPref() {
  return useTableColsPref<CustomerColKey>({
    screen: "customers",
    keys: CUSTOMERS_MIDDLE_KEYS,
    labels: CUSTOMERS_COL_LABELS,
    legacyKeys,
    toastId: "customer-cols-saved",
  });
}
