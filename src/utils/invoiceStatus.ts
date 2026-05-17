// منطق حساب حالة الفاتورة بعد الدفع، مع التحقق من القيد على قاعدة البيانات.
// يجب أن يطابق invoices_status_check: ('paid','partial','pending','overdue','cancelled')

export const ALLOWED_INVOICE_STATUSES = [
  "paid",
  "partial",
  "pending",
  "overdue",
  "cancelled",
] as const;

export type InvoiceStatus = (typeof ALLOWED_INVOICE_STATUSES)[number];

export function isAllowedInvoiceStatus(s: unknown): s is InvoiceStatus {
  return typeof s === "string" && (ALLOWED_INVOICE_STATUSES as readonly string[]).includes(s);
}

/**
 * يحسب حالة الفاتورة بعد دفعة جديدة.
 * - paid: المدفوع >= الإجمالي (بهامش 0.01)
 * - partial: مدفوع جزئياً (> 0.01) لكن أقل من الإجمالي
 * - pending: لم يُدفع شيء فعلي
 *
 * ملاحظة: overdue / cancelled لا تُشتقّان من الدفعة — تُضبطان يدوياً.
 */
export function computeInvoiceStatusAfterPayment(params: {
  total: number;
  paidAfter: number;
}): InvoiceStatus {
  const total = Number(params.total) || 0;
  const paid = Number(params.paidAfter) || 0;
  if (total > 0 && paid >= total - 0.01) return "paid";
  if (paid > 0.01) return "partial";
  return "pending";
}
