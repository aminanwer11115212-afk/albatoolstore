import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { openWhatsApp } from "@/utils/whatsapp";

export type ShareDocType =
  | "invoice"          // فاتورة عادية أو فاتورة POS (نفس جدول invoices)
  | "quote"            // عرض سعر (يشمل عروض السعر الجانبية is_side=true)
  | "return"
  | "statement-customer"
  | "statement-supplier"
  | "packaging-invoice"
  | "packaging-quote"
  | "unavailable-invoice"
  | "unavailable-quote"
  | "credit-charge";   // إيصال شحن رصيد العميل (doc_id = transaction.id)

export interface ShareDocOptions {
  docType: ShareDocType;
  docId: string;
  /** رقم هاتف الواتساب (اختياري — لو غاب نفتح واتساب بدون مرسل) */
  phone?: string | null;
  /** اسم العميل لاستخدامه في رأس الرسالة */
  customerName?: string | null;
  /** رقم المستند (INV-… / POS-… / QT-…) */
  docNumber?: string | null;
  /** المبلغ الإجمالي (اختياري — يُعرض في الرسالة لو وُجد) */
  total?: number | null;
  /** رمز العملة */
  currency?: string | null;
  /** أقسام مخفية في المعاينة الداخلية تُنقل إلى الرابط العام */
  hiddenSections?: string[];
  /** مدّة صلاحية الرابط بالساعات (افتراضي 7 أيام) */
  ttlHours?: number;
  /** عنوان مخصص للمستند في الرسالة (مثلاً "فاتورة كاش") */
  docLabel?: string;
}

function docLabelDefault(t: ShareDocType): string {
  switch (t) {
    case "invoice": return "فاتورة";
    case "quote": return "عرض سعر";
    case "return": return "مرتجع";
    case "statement-customer": return "كشف حساب";
    case "statement-supplier": return "كشف حساب";
    case "packaging-invoice":
    case "packaging-quote": return "كشف تغليف";
    case "unavailable-invoice":
    case "unavailable-quote": return "أصناف غير متوفّرة";
    case "credit-charge": return "إيصال شحن رصيد";
  }
}

/**
 * يطلب رابط مشاركة عام لمستند (عبر edge function create-document-share-token)
 * ثم يفتح واتساب برسالة تحتوي رابط المعاينة. يعمل لكل أنواع المستندات،
 * بما فيها فواتير POS (نفس جدول invoices) وعروض السعر الجانبية (نفس جدول quotes).
 *
 * يُعيد الرابط لمن يحتاج نسخه/تخزينه.
 */
export async function shareDocumentViaWhatsApp(opts: ShareDocOptions): Promise<string | null> {
  const {
    docType, docId, phone, customerName, docNumber,
    total, currency, hiddenSections, ttlHours = 24, docLabel,
  } = opts;

  if (!docId) {
    toast.error("لا يمكن المشاركة قبل حفظ المستند");
    return null;
  }

  const tId = toast.loading("جاري إنشاء رابط المشاركة...");
  try {
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) throw new Error("يجب تسجيل الدخول");
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !ANON) throw new Error("إعدادات الخادم ناقصة");

    const body: Record<string, unknown> = {
      doc_type: docType,
      doc_id: docId,
      ttl_hours: ttlHours,
    };
    if (Array.isArray(hiddenSections) && hiddenSections.length) {
      body.hidden_sections = hiddenSections;
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-document-share-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: ANON,
      },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.error || "فشل إنشاء الرابط");
    const url: string = json.url;
    toast.dismiss(tId);

    const label = docLabel || docLabelDefault(docType);
    const nameLine = customerName ? `مرحباً ${customerName} 👋` : "مرحباً 👋";
    const lines = [
      nameLine,
      `📄 ${label}${docNumber ? ` رقم: ${docNumber}` : ""}`,
    ];
    if (typeof total === "number" && total > 0) {
      lines.push(`💰 الإجمالي: ${Number(total).toLocaleString()} ${currency || ""}`.trim());
    }
    lines.push("", "رابط المعاينة:", url);
    const msg = lines.join("\n");

    openWhatsApp(phone || undefined, msg);
    return url;
  } catch (e: any) {
    toast.dismiss(tId);
    toast.error(`فشل إنشاء رابط المشاركة: ${e?.message || "خطأ غير معروف"}`);
    return null;
  }
}
