// منطق تقسيم الدفعة عند تجاوز المتبقي على الفاتورة:
// - applied: الجزء الذي يُقفل الفاتورة (لا يتجاوز المتبقي)
// - overpay: الفائض الذي يُسجَّل كقيد سلفة/دائن للعميل (customer_credit)

export interface SplitPaymentInput {
  amount: number;          // المبلغ المُدخَل
  total: number;           // إجمالي الفاتورة
  alreadyPaid: number;     // المدفوع سابقاً على نفس الفاتورة
}

export interface SplitPaymentResult {
  applied: number;   // يُضاف إلى paid_amount للفاتورة
  overpay: number;   // يُسجَّل كحركة customer_credit منفصلة
  newPaid: number;   // alreadyPaid + applied (مقفل عند total)
  newDue: number;    // 0 إذا كان مُغطّى أو فائض
}

export function splitPayment(input: SplitPaymentInput): SplitPaymentResult {
  const total = Math.max(0, Number(input.total) || 0);
  const paid = Math.max(0, Number(input.alreadyPaid) || 0);
  const amount = Math.max(0, Number(input.amount) || 0);
  const remaining = Math.max(0, total - paid);
  const applied = Math.min(amount, remaining);
  const overpay = Math.max(0, amount - applied);
  const newPaid = paid + applied;
  const newDue = Math.max(0, total - newPaid);
  return { applied, overpay, newPaid, newDue };
}
