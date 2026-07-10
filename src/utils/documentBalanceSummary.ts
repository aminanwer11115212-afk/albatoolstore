/**
 * حساب ملخّص الرصيد لعرضه أسفل جدول البنود في معاينة/طباعة المستندات.
 *
 * قواعد:
 * - previousDebt/Credit يمثّلان الرصيد السابق للعميل قبل هذه الفاتورة.
 * - المتبقي على الفاتورة الحالية = max(grandTotal - paidAmount, 0).
 * - الفائض على الفاتورة الحالية = max(paidAmount - grandTotal, 0).
 *
 * السلوك المرئي:
 *   - remaining > 0 → "المتبقي على العميل" أحمر بعلامة −
 *   - overpaid  > 0 → "أُضيفت إلى حسابه" أخضر بعلامة +
 *   - غير ذلك       → "مسددة بالكامل"
 */
export interface DocumentBalanceInput {
  grandTotal: number;
  discount?: number;
  paidAmount?: number;
  /** رصيد العميل المدين قبل هذه الفاتورة (customers.balance مطروحًا منه متبقّي هذه الفاتورة). */
  previousDebt?: number;
  /** رصيد العميل الدائن قبل هذه الفاتورة (customers.credit_balance). */
  previousCredit?: number;
}

export interface DocumentBalanceSummary {
  grandTotal: number;
  discount: number;
  paidAmount: number;
  previousDebt: number;
  previousCredit: number;
  /** متبقّي هذه الفاتورة فقط. */
  remaining: number;
  /** فائض على هذه الفاتورة فقط (يُضاف كرصيد للعميل). */
  overpaid: number;
  isPaid: boolean;
  hasDiscount: boolean;
  hasPreviousDebt: boolean;
  hasPreviousCredit: boolean;
}

export function computeDocumentBalance(input: DocumentBalanceInput): DocumentBalanceSummary {
  const grandTotal = Math.max(Number(input.grandTotal) || 0, 0);
  const discount = Math.max(Number(input.discount) || 0, 0);
  const paidAmount = Math.max(Number(input.paidAmount) || 0, 0);
  const previousDebt = Math.max(Number(input.previousDebt) || 0, 0);
  const previousCredit = Math.max(Number(input.previousCredit) || 0, 0);

  const diff = paidAmount - grandTotal;
  const remaining = diff < -0.01 ? Math.round(-diff * 100) / 100 : 0;
  const overpaid = diff > 0.01 ? Math.round(diff * 100) / 100 : 0;
  const isPaid = remaining === 0 && overpaid === 0 && grandTotal > 0;

  return {
    grandTotal,
    discount,
    paidAmount,
    previousDebt,
    previousCredit,
    remaining,
    overpaid,
    isPaid,
    hasDiscount: discount > 0.01,
    hasPreviousDebt: previousDebt > 0.01,
    hasPreviousCredit: previousCredit > 0.01,
  };
}
