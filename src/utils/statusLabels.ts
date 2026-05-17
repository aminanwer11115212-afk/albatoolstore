// خريطة موحّدة لتعريب حالات الفواتير وعروض الأسعار والمرتجعات
// مطابقة للحالات المعروضة في صفحات النظام (InvoicesPage / QuotesPage)

const INVOICE_STATUS: Record<string, string> = {
  paid:      "مدفوعة",
  partial:   "مدفوعة جزئياً",
  unpaid:    "غير مدفوعة",
  pending:   "مستحقة",
  overdue:   "متأخرة",
  cancelled: "ملغاة",
  canceled:  "ملغاة",
  draft:     "جديدة",
};

const QUOTE_STATUS: Record<string, string> = {
  draft:     "عرض سعر",
  sent:      "مرسل",
  accepted:  "مقبول",
  approved:  "مقبول",
  rejected:  "مرفوض",
  expired:   "منتهي",
  converted: "محوّل لفاتورة",
  cancelled: "ملغى",
  canceled:  "ملغى",
};

const RETURN_STATUS: Record<string, string> = {
  draft:     "عرض سعر",
  pending:   "معلّق",
  approved:  "مقبول",
  completed: "مكتمل",
  rejected:  "مرفوض",
  cancelled: "ملغى",
  canceled:  "ملغى",
};

export function arInvoiceStatus(s?: string | null): string {
  if (!s) return "-";
  return INVOICE_STATUS[s.toLowerCase()] || s;
}

export function arQuoteStatus(s?: string | null): string {
  if (!s) return "-";
  return QUOTE_STATUS[s.toLowerCase()] || s;
}

export function arReturnStatus(s?: string | null): string {
  if (!s) return "-";
  return RETURN_STATUS[s.toLowerCase()] || s;
}
