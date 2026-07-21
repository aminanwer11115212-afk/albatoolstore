/**
 * Normalize phone to E.164 digits (no '+').
 */
export function normalizeWhatsAppPhone(phone: string): string {
  let cleanPhone = (phone || "").replace(/[\s\-\(\)]/g, "");
  if (cleanPhone.startsWith("0")) {
    cleanPhone = "249" + cleanPhone.slice(1);
  }
  if (cleanPhone.startsWith("+")) {
    cleanPhone = cleanPhone.slice(1);
  }
  return cleanPhone;
}

/**
 * يتحقق هل الرقم صالح للإرسال عبر واتساب (بعد التطبيع: 8–15 خانة رقمية).
 */
export function isValidWhatsAppPhone(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const n = normalizeWhatsAppPhone(String(phone));
  return /^\d{8,15}$/.test(n);
}

/**
 * يختار رقم واتساب العميل: يفضّل حقل `whatsapp` ثم يقع لـ `phone` إن كان `whatsapp`
 * فارغاً أو غير صالح. يُرجع `null` إذا لم يوجد رقم صالح للإرسال.
 *
 * هذا هو المصدر الوحيد المعتمد لاستخراج رقم واتساب من سجل عميل في كامل النظام
 * — لا تستخدم `customer.phone` مباشرة لزر/مشاركة واتساب.
 */
export function pickCustomerWhatsApp(
  customer: { whatsapp?: string | null; phone?: string | null } | null | undefined,
): string | null {
  if (!customer) return null;
  const wa = (customer.whatsapp || "").trim();
  if (isValidWhatsAppPhone(wa)) return wa;
  const ph = (customer.phone || "").trim();
  if (isValidWhatsAppPhone(ph)) return ph;
  return null;
}


/**
 * Build a WhatsApp deep link that opens the installed app directly
 * (mobile or desktop), skipping the wa.me intermediate web page.
 */
export function buildWhatsAppDeepLink(phone: string | undefined | null, message: string): string {
  const encoded = encodeURIComponent(message);
  if (phone && phone.trim()) {
    const clean = normalizeWhatsAppPhone(phone);
    return `whatsapp://send?phone=${clean}&text=${encoded}`;
  }
  return `whatsapp://send?text=${encoded}`;
}

/**
 * Build a wa.me web fallback URL (used only if the WhatsApp app isn't installed).
 */
export function buildWhatsAppWebFallback(phone: string | undefined | null, message: string): string {
  const encoded = encodeURIComponent(message);
  if (phone && phone.trim()) {
    const clean = normalizeWhatsAppPhone(phone);
    return `https://wa.me/${clean}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

/**
 * Legacy: returns the deep link directly so existing callers
 * (window.open / location.href) open the app instead of wa.me.
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  return buildWhatsAppDeepLink(phone, message);
}

/**
 * Open WhatsApp: try the native app first via the whatsapp:// scheme,
 * and fall back to wa.me only if the app isn't installed.
 */
export function openWhatsApp(phone: string | undefined | null, message: string): void {
  const deep = buildWhatsAppDeepLink(phone, message);
  const web = buildWhatsAppWebFallback(phone, message);

  let fellBack = false;
  const onHide = () => { fellBack = true; };
  document.addEventListener("visibilitychange", onHide, { once: true });
  window.addEventListener("pagehide", onHide, { once: true });
  window.addEventListener("blur", onHide, { once: true });

  try {
    window.location.href = deep;
  } catch {
    /* noop */
  }

  setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("blur", onHide);
    if (!fellBack && document.visibilityState === "visible") {
      window.open(web, "_blank");
    }
  }, 1500);
}

export type WhatsAppMessageType = 
  | "invoice_notification"
  | "payment_reminder"
  | "payment_received"
  | "payment_overdue"
  | "refund_created";

interface InvoiceInfo {
  invoice_number: string;
  total: number;
  paid_amount: number;
  due_amount: number;
  date: string;
  customerName?: string;
  currency?: string;
}

export function generateWhatsAppMessage(type: WhatsAppMessageType, invoice: InvoiceInfo): string {
  const currency = "";
  const name = invoice.customerName || "عزيزي العميل";
  const total = Number(invoice.total).toLocaleString();
  const paid = Number(invoice.paid_amount).toLocaleString();
  const due = Number(invoice.due_amount).toLocaleString();

  switch (type) {
    case "invoice_notification":
      return [
        `مرحباً ${name} 👋`,
        ``,
        `📄 *إشعار فاتورة رقم: ${invoice.invoice_number}*`,
        `📅 التاريخ: ${invoice.date}`,
        `💰 المبلغ الإجمالي: ${total} ${currency}`,
        ``,
        `نرجو مراجعة الفاتورة والتواصل معنا لأي استفسار.`,
        ``,
        `شكراً لتعاملكم معنا 🙏`,
      ].join("\n");

    case "payment_reminder":
      return [
        `مرحباً ${name} 👋`,
        ``,
        `⏰ *تذكير بالدفع - فاتورة رقم: ${invoice.invoice_number}*`,
        `💰 المبلغ الإجمالي: ${total} ${currency}`,
        `✅ المدفوع: ${paid} ${currency}`,
        `⚠️ المتبقي: ${due} ${currency}`,
        ``,
        `نود تذكيركم بسداد المبلغ المتبقي في أقرب وقت ممكن.`,
        ``,
        `شكراً لتعاونكم 🙏`,
      ].join("\n");

    case "payment_received":
      return [
        `مرحباً ${name} 👋`,
        ``,
        `✅ *تأكيد استلام الدفع*`,
        `📄 فاتورة رقم: ${invoice.invoice_number}`,
        `💰 المبلغ المدفوع: ${paid} ${currency}`,
        Number(invoice.due_amount) > 0
          ? `⚠️ المتبقي: ${due} ${currency}`
          : `✅ تم سداد كامل المبلغ`,
        ``,
        `شكراً لك على الدفع! 🙏`,
      ].join("\n");

    case "payment_overdue":
      return [
        `مرحباً ${name} 👋`,
        ``,
        `🔴 *تنبيه تأخر في السداد*`,
        `📄 فاتورة رقم: ${invoice.invoice_number}`,
        `📅 تاريخ الفاتورة: ${invoice.date}`,
        `💰 المبلغ الإجمالي: ${total} ${currency}`,
        `⚠️ المبلغ المتأخر: ${due} ${currency}`,
        ``,
        `نرجو التكرم بسداد المبلغ المستحق في أقرب فرصة لتجنب أي إجراءات إضافية.`,
        ``,
        `للتواصل والاستفسار نحن في الخدمة.`,
      ].join("\n");

    case "refund_created":
      return [
        `مرحباً ${name} 👋`,
        ``,
        `🔄 *تم إنشاء استرداد*`,
        `📄 رقم الفاتورة: ${invoice.invoice_number}`,
        `💰 المبلغ: ${total} ${currency}`,
        ``,
        `تم إنشاء طلب استرداد لفاتورتكم. سيتم معالجته في أقرب وقت.`,
        ``,
        `شكراً لتعاملكم معنا 🙏`,
      ].join("\n");

    default:
      return generateInvoiceWhatsAppMessage(invoice);
  }
}

/**
 * Legacy function - kept for compatibility
 */
export function generateInvoiceWhatsAppMessage(invoice: InvoiceInfo): string {
  return generateWhatsAppMessage("invoice_notification", invoice);
}

export function openWhatsAppInvoice(phone: string, invoice: InvoiceInfo): void {
  const message = generateInvoiceWhatsAppMessage(invoice);
  openWhatsApp(phone, message);
}

export function openWhatsAppMessage(phone: string, type: WhatsAppMessageType, invoice: InvoiceInfo): void {
  const message = generateWhatsAppMessage(type, invoice);
  openWhatsApp(phone, message);
}
