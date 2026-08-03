import { supabase } from "@/integrations/supabase/client";
import { generatePrintHTML } from "@/utils/printTemplate";
import { formatPackaging, formatTransports } from "@/utils/printExtras";

/**
 * ورقة العميل تُبنى في المتصفّح بنفس قالب الطباعة.
 *
 * ## لماذا خرجت من دالّة الحافة
 * كانت `document-share` تبني الـHTML على الخادم، ومجلد `supabase/functions`
 * لا يُعدَّل من المستودع في هذا المشروع. فبقي رابط العميل على نسخةٍ أقدم من
 * التطبيق ولا سبيل لتحديثه — ومعه قالبٌ ثانٍ يُحرَس بعقدٍ واختبارات كي لا
 * ينحرف عن الأوّل.
 *
 * الآن تقرأ الصفحة بياناتها من `get_shared_document` (دالّة قاعدة بيانات
 * حارسها التوكن) وتبني الورقة بـ`generatePrintHTML` نفسها. فالنتيجة:
 *
 *   • **قالبٌ واحد** لا نسختان — ينتهي الانحراف من أصله لا بالعقود.
 *   • أي تعديل على الورقة يصل العميل مع نشر الواجهة، بلا نشر دوالّ.
 *   • ونفس الأرقام حرفياً: «الحساب القديم» و«رصيد العميل الحالي» و التغليف
 *     والترحيل تمرّ بنفس الدوالّ التي تمرّ بها المعاينة.
 */

export interface SharedDocumentPayload {
  doc_type: "invoice" | "quote" | "return";
  hidden_sections?: string[];
  doc: any;
  items: any[];
  customer: any;
  company: any;
  packaging?: any[];
  packaging_items?: any[];
  transports?: any[];
  prev_net?: number;
  current_net?: number;
  error?: string;
}

/** رسائل الأخطاء التي تُعيدها دالّة القاعدة، بلغة العميل. */
const ERROR_TEXT: Record<string, string> = {
  missing_token: "رابط غير صالح: لا يوجد معرّف مستند.",
  not_found: "الرابط غير صحيح أو أُلغي.",
  expired: "انتهت صلاحية هذا الرابط — اطلب رابطاً جديداً.",
  doc_missing: "المستند لم يعد موجوداً.",
  unsupported_type: "نوع المستند غير مدعوم.",
};

export class SharedDocumentError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(ERROR_TEXT[code] || "تعذّر فتح المستند");
    this.code = code;
  }
}

/** عنوان المستند كما يراه العميل — نفس تسميات قالب الطباعة. */
function docTitleOf(payload: SharedDocumentPayload): string {
  if (payload.doc_type === "quote") return "عرض سعر";
  if (payload.doc_type === "return") return "مرتجع مبيعات";
  return payload.doc?.type === "cash" ? "فاتورة كاش" : "فاتورة مبيعات";
}

const num = (v: any) => Number(v || 0);

/** يحوّل حمولة القاعدة إلى وسائط `generatePrintHTML`. */
export function buildSharedDocumentHTML(payload: SharedDocumentPayload): string {
  if (payload?.error) throw new SharedDocumentError(payload.error);
  if (!payload?.doc) throw new SharedDocumentError("doc_missing");

  const isQuote = payload.doc_type === "quote";
  const d = payload.doc;
  const prevNet = num(payload.prev_net);

  return generatePrintHTML({
    type: payload.doc_type === "return" ? "return" : payload.doc_type,
    isCash: d.type === "cash",
    number: d.invoice_number || d.quote_number || d.return_number || "",
    date: d.date || "",
    dueDate: d.due_date || undefined,
    customer: payload.customer || null,
    items: (payload.items || []).map((it: any) => ({
      product_name: it.product_name,
      quantity: num(it.quantity),
      unit_price: num(it.unit_price),
      foreign_price: num(it.foreign_price),
      tax_amount: 0,
      discount: num(it.discount),
      total: num(it.total),
    })),
    subtotal: num(d.subtotal),
    taxTotal: 0,
    discountTotal: num(d.discount),
    shipping: num(d.shipping),
    grandTotal: num(d.total),
    paidAmount: isQuote ? 0 : num(d.paid_amount),
    notes: d.notes || undefined,
    company: payload.company || null,
    status: d.status || undefined,
    paymentMethod: d.payment_method || undefined,
    // «الحساب القديم» بإشارة الدفاتر: موجب = على العميل.
    previousDebt: prevNet > 0 ? prevNet : 0,
    previousCredit: prevNet < 0 ? -prevNet : 0,
    // رصيد العميل الآن — منه يُشتقّ «المدفوع» كما في المعاينة تماماً.
    currentNet: isQuote || payload.customer == null ? null : num(payload.current_net),
    packagingInfo: formatPackaging(payload.packaging || [], payload.packaging_items || []),
    transportInfo: formatTransports(payload.transports || []),
    hiddenSections: Array.isArray(payload.hidden_sections) ? payload.hidden_sections : [],
  } as any);
}

/**
 * يقرأ المستند بتوكنه ويبني ورقته.
 * يرمي `SharedDocumentError` برسالةٍ بلغة العميل عند الرفض.
 */
export async function fetchSharedDocumentHTML(token: string): Promise<string> {
  const { data, error } = await (supabase as any).rpc("get_shared_document", { _token: token });
  if (error) throw error;
  return buildSharedDocumentHTML(data as SharedDocumentPayload);
}
