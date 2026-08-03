/**
 * مشاركة ملف/صورة مرفوعة (إيصال، صورة جرد، PDF…) عبر لوحة المشاركة الأصلية
 * في الجهاز — واتساب، تيليجرام، البريد، حفظ في الملفات… إلخ.
 *
 * ثلاثة مسارات (نفس منطق shareDocumentPdf):
 *   1. الجهاز يدعم مشاركة الملفات → نرسل الملف نفسه.
 *   2. يدعم المشاركة النصية فقط → نشارك الرابط نصاً.
 *   3. لا يدعم شيئاً (سطح المكتب) → نفتح واتساب ويب بالرابط.
 */
import { buildWhatsAppDeepLink } from "@/utils/whatsapp";

export interface ShareFileInput {
  /** رابط الملف (عام أو موقّع) */
  url: string;
  /** اسم الملف كما يصل للمستلم */
  fileName: string;
  /** نوع MIME إن عُرف */
  mimeType?: string | null;
  /**
   * نص مرافق — يُرسل مع الملف فقط إن طُلب صراحةً.
   *
   * كان اسم الملف يُمرَّر هنا من كل نداءات المرفقات، فيصل المستلم على واتساب
   * سطرٌ نصّي فيه `17857000106409110774407288145045-cropped.jpg` فوق الصورة.
   * والمطلوب صورةٌ وحدها بلا شيء، فالافتراض الآن ألّا يُرسل نصّ مع الملف.
   */
  text?: string;
  /** عنوان المشاركة */
  title?: string;
}

export type ShareFileOutcome = "file" | "text" | "whatsapp" | "cancelled";

function canShareFiles(file: File): boolean {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

export async function shareFileNative(input: ShareFileInput): Promise<ShareFileOutcome> {
  const { url, fileName, mimeType, text, title } = input;

  // 1) محاولة مشاركة الملف نفسه
  try {
    if (navigator.share) {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], fileName, {
          type: blob.type || mimeType || "application/octet-stream",
        });
        if (canShareFiles(file)) {
          try {
            // الملف وحده ما لم يُطلب نصّ صراحةً — لا اسم ملف ولا عنوان يُحشر
            // فوق الصورة عند المستلم.
            await navigator.share(
              text ? { files: [file], title, text } : { files: [file] },
            );
            return "file";
          } catch (e: any) {
            if (e?.name === "AbortError") return "cancelled";
          }
        }
      }
    }
  } catch {
    /* نتابع للمسار التالي */
  }

  // 2) مشاركة نصية بالرابط
  try {
    if (navigator.share) {
      await navigator.share({ title, text: text ? `${text}\n${url}` : url, url });
      return "text";
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return "cancelled";
  }

  // 3) واتساب مباشرة
  window.open(buildWhatsAppDeepLink(null, text ? `${text}\n${url}` : url), "_blank");
  return "whatsapp";
}
