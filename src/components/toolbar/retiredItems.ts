// قائمة معرّفات أزرار شريط الأدوات التي تم حذفها نهائياً من الواجهة.
// أي معرّف هنا:
//   - لا يظهر في علبة "المخفية" داخل محرر الأدوات (HiddenItemsTray).
//   - لا تُحفظ له تسمية مخصّصة في useToolbarLabels.
//   - يُحذف تلقائياً من قوائم localStorage عند أول قراءة.
export const RETIRED_TOOLBAR_ITEM_IDS: ReadonlySet<string> = new Set([
  "sum-count",
  "sum-subtotal",
  "sum-discount",
  "sum-tax",
  // أزرار التخصيص/إعادة الافتراضي القديمة دُمجت في زر إعدادات واحد:
  "__customize_reset__",
  "__customize_toggle__",
  // زر التكبير/التصغير المستقل دُمج داخل قائمة الإعدادات:
  "zoom",
]);

export function isRetiredToolbarItem(id: string): boolean {
  return RETIRED_TOOLBAR_ITEM_IDS.has(id);
}
