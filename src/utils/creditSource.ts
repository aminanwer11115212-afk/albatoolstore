/**
 * Classifier for `customer_credit` transaction rows.
 *
 * customer_credit rows come from several places:
 *   - overpay_invoice : فائض من دفعة على فاتورة (يظهر رقم الفاتورة في description)
 *   - manual_charge   : من allocate_customer_charge → allocation.kind='surplus'
 *   - credit_used     : استهلاك رصيد (amount سالب) — allocation.kind='credit_used'
 *   - payment_adjust  : تعديل دفع لاحق (وصف يحتوي "تعديل")
 *   - return_credit   : من مرتجع (وصف يحتوي "مرتجع")
 *   - unknown         : غير مصنّف
 *
 * التصنيف مشتق من `allocation` + `description` بدون تعديل schema.
 */
export type CreditSource =
  | "overpay_invoice"
  | "manual_charge"
  | "credit_used"
  | "payment_adjust"
  | "return_credit"
  | "unknown";

export interface CreditSourceInfo {
  source: CreditSource;
  label: string;
  colorClass: string; // Tailwind semantic classes for badge
  linkedInvoice?: string | null;
}

const INV_REGEX = /(?:فاتورة|رقم|SRN)[\s#:]*([A-Za-z0-9\-_/]+)/i;

export function classifyCreditRow(row: {
  amount?: number | null;
  description?: string | null;
  reference_id?: string | null;
  allocation?: any;
  category?: string | null;
}): CreditSourceInfo {
  const desc = String(row.description || "");
  const kind = row.allocation?.kind || null;
  const amt = Number(row.amount || 0);

  const invMatch = desc.match(INV_REGEX);
  const linkedInvoice =
    row.allocation?.invoice_number ||
    (invMatch ? invMatch[1] : null);

  // استهلاك للرصيد (amount سالب أو kind=credit_used)
  if (kind === "credit_used" || amt < 0) {
    return {
      source: "credit_used",
      label: "استهلاك رصيد",
      colorClass: "bg-amber-100 text-amber-800 border-amber-300",
      linkedInvoice,
    };
  }

  // شحن رصيد يدوي — allocation.kind فاصل قاطع، لا يعتمد على وصف قد يحتوي "فائض"
  if (kind === "surplus" || /شحن\s*رصيد/.test(desc)) {
    return {
      source: "manual_charge",
      label: "شحن يدوي",
      colorClass: "bg-blue-100 text-blue-800 border-blue-300",
      linkedInvoice: null,
    };
  }

  // فائض من فاتورة
  if (/فائض/.test(desc) || linkedInvoice) {
    return {
      source: "overpay_invoice",
      label: "فائض فاتورة",
      colorClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      linkedInvoice,
    };
  }

  if (/تعديل\s*(?:دفع|فاتورة)/.test(desc)) {
    return {
      source: "payment_adjust",
      label: "تعديل دفع",
      colorClass: "bg-purple-100 text-purple-800 border-purple-300",
      linkedInvoice,
    };
  }

  if (/مرتجع|إرجاع/.test(desc)) {
    return {
      source: "return_credit",
      label: "من مرتجع",
      colorClass: "bg-orange-100 text-orange-800 border-orange-300",
      linkedInvoice,
    };
  }

  return {
    source: "unknown",
    label: "غير محدد",
    colorClass: "bg-muted text-muted-foreground border-border",
    linkedInvoice,
  };
}

export const CREDIT_SOURCE_OPTIONS: { value: CreditSource; label: string }[] = [
  { value: "overpay_invoice", label: "فائض فاتورة" },
  { value: "manual_charge", label: "شحن يدوي" },
  { value: "credit_used", label: "استهلاك رصيد" },
  { value: "payment_adjust", label: "تعديل دفع" },
  { value: "return_credit", label: "من مرتجع" },
  { value: "unknown", label: "غير محدد" },
];

/**
 * وصف مصدر التسوية التلقائية لقيد `credit_used` (allocation.auto = true).
 * يُستخدم لعرض «مسددة بالكامل (من دفعة فاتورة رقم X)» بدل «مسددة» بلا سياق.
 */
export interface AutoSettlementInfo {
  auto: boolean;
  sourceKind: "invoice_overpay" | "manual_charge" | null;
  sourceInvoiceNumber: string | null;
  sourceDate: string | null;
  /** نص عربي جاهز للعرض بجانب حالة الفاتورة */
  text: string | null;
}

export function describeAutoSettlement(row: { allocation?: any } | null | undefined): AutoSettlementInfo {
  const a = row?.allocation || null;
  const none: AutoSettlementInfo = { auto: false, sourceKind: null, sourceInvoiceNumber: null, sourceDate: null, text: null };
  if (!a || a.auto !== true) return none;
  const kind = a.source_kind === "invoice_overpay" ? "invoice_overpay" : a.source_kind === "manual_charge" ? "manual_charge" : null;
  const num = a.source_invoice_number ? String(a.source_invoice_number) : null;
  const date = a.source_date ? String(a.source_date) : null;
  let text: string | null = null;
  if (kind === "invoice_overpay") text = `من دفعة فاتورة رقم ${num || "—"}`;
  else if (kind === "manual_charge") text = `من شحن رصيد بتاريخ ${date || "—"}`;
  return { auto: true, sourceKind: kind, sourceInvoiceNumber: num, sourceDate: date, text };
}

/** نص حالة الفاتورة مع سياق مصدر التسوية التلقائية إن وُجد. */
export function autoSettledStatusText(baseLabel: string, info: AutoSettlementInfo): string {
  return info.auto && info.text ? `${baseLabel} (${info.text})` : baseLabel;
}
