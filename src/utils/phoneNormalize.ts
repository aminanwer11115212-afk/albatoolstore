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
  let s = String(val)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200b-\u200d\ufeff]/g, "") // strip bidi/zero-width marks
    .replace(/[٠-٩۰-۹]/g, (d) => arabicMap[d] || d);
  const hasPlus = s.trimStart().startsWith("+");
  s = s.replace(/\D+/g, "");
  return hasPlus ? "+" + s : s;
}

/** هل Contact Picker API (ويب Android) مدعوم في هذا المتصفح؟ */
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
 * يفتح منتقي جهات الاتصال الأصلي في الجهاز:
 *  - داخل تطبيق Capacitor (Android/iOS): يستخدم @capacitor-community/contacts.
 *  - في متصفح Android الحديث: يستخدم navigator.contacts.select.
 *  - غير ذلك: يرمي Error برسالة عربية واضحة.
 */
export async function pickNativeContact(): Promise<PickedContact | null> {
  // 1) بيئة Capacitor الأصلية
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor?.isNativePlatform?.()) {
      const { Contacts } = await import("@capacitor-community/contacts");
      const perm = await Contacts.requestPermissions();
      if (perm.contacts !== "granted") {
        throw new Error("تم رفض إذن جهات الاتصال — فعّله من إعدادات الجهاز");
      }
      const res: any = await Contacts.pickContact({
        projection: { name: true, phones: true },
      });
      const c = res?.contact;
      if (!c) return null;
      const tel = Array.isArray(c.phones) && c.phones.length ? String(c.phones[0]?.number || "") : "";
      const name = c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(" ").trim();
      return { name: name || undefined, tel: normalizePhoneInput(tel) };
    }
  } catch (e: any) {
    // إذا كان الخطأ عن الأذونات، مرّره
    if (/permission|إذن|denied|رفض/i.test(String(e?.message || ""))) throw e;
    // وإلا تابع لمحاولة Web API
  }

  // 2) متصفح Android يدعم Contact Picker API
  if (isContactPickerSupported()) {
    // @ts-expect-error - غير مُعرَّف في TS lib
    const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
    if (!contacts || !contacts.length) return null;
    const c = contacts[0];
    const tel = Array.isArray(c.tel) && c.tel.length ? String(c.tel[0]) : "";
    const name = Array.isArray(c.name) && c.name.length ? String(c.name[0]) : "";
    return { name, tel: normalizePhoneInput(tel) };
  }

  // 3) غير مدعوم
  throw new Error("هذا الجهاز لا يدعم اختيار جهة الاتصال من المتصفح — ثبّت التطبيق من المتجر لتفعيل هذه الميزة");
}

/** إبقاء الاسم القديم للتوافق مع الاستدعاءات السابقة. */
export const pickContactPhone = pickNativeContact;

