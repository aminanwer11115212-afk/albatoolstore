/**
 * أداة موحّدة لتطبيع أرقام الهواتف/الواتساب.
 *
 * - تحوّل الأرقام العربية/الفارسية ٠-٩ إلى 0-9.
 * - تحذف كل ما ليس رقماً (فراغات، شرطات، أقواس، نقاط).
 * - تحافظ على "+" فقط إن كانت في البداية.
 *
 * تُستعمل في جميع حقول الإدخال أثناء الكتابة (onChange) وليس عند onBlur،
 * حتى يكون التنسيق فورياً ولا يبقى فراغ يُخزَّن في قاعدة البيانات.
 */
export function normalizePhoneInput(val: string | null | undefined): string {
  if (!val) return "";
  const arabicMap: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  let s = String(val).replace(/[٠-٩۰-۹]/g, (d) => arabicMap[d] || d);
  const hasPlus = s.trimStart().startsWith("+");
  s = s.replace(/\D+/g, "");
  return hasPlus ? "+" + s : s;
}

/** هل Contact Picker API مدعوم في هذا المتصفح؟ */
export function isContactPickerSupported(): boolean {
  try {
    // @ts-expect-error - navigator.contacts هو API غير قياسي بعد
    return typeof navigator !== "undefined" && !!navigator.contacts && typeof navigator.contacts.select === "function";
  } catch {
    return false;
  }
}

export type PickedContact = { name?: string; tel?: string };

/**
 * يفتح منتقي جهات الاتصال (Android Chrome / Edge على HTTPS فقط).
 * يُرجع { name, tel } لأول جهة مختارة، أو null إن أُلغيت العملية.
 * يرمي Error إن كان غير مدعوم — استعمل isContactPickerSupported() أولاً.
 */
export async function pickContactPhone(): Promise<PickedContact | null> {
  if (!isContactPickerSupported()) {
    throw new Error("Contact Picker غير مدعوم على هذا الجهاز/المتصفح");
  }
  // @ts-expect-error - navigator.contacts غير مُعرَّف في TS lib
  const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
  if (!contacts || !contacts.length) return null;
  const c = contacts[0];
  const tel = Array.isArray(c.tel) && c.tel.length ? String(c.tel[0]) : "";
  const name = Array.isArray(c.name) && c.name.length ? String(c.name[0]) : "";
  return { name, tel: normalizePhoneInput(tel) };
}
