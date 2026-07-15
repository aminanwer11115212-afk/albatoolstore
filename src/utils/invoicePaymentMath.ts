import { computeInvoiceStatusAfterPayment, type InvoiceStatus } from "@/utils/invoiceStatus";

export function roundMoney(value: number): number {
  const n = Number(value) || 0;
  return Math.round(n * 100) / 100;
}

export interface InvoicePaymentAdjustmentInput {
  currentTotal: number;
  currentPaid: number;
  currentDiscount?: number | null;
  paymentAmount?: number;
  discountAmount?: number;
  creditUse?: number;
  isPos?: boolean;
}

export interface InvoicePaymentAdjustmentResult {
  nextDiscount: number;
  nextTotal: number;
  nextPaid: number;
  newDue: number;
  nextStatus: InvoiceStatus;
  creditApplied: number;
  cashApplied: number;
  cashOver: number;
}

/**
 * المصدر الموحّد لحساب أثر الخصم/الدفع على الفاتورة.
 * الخصم يقلّل total ويزيد discount، ولا يُحسب كمدفوع نقدي.
 */
export function computeInvoicePaymentAdjustment(input: InvoicePaymentAdjustmentInput): InvoicePaymentAdjustmentResult {
  const currentTotal = Math.max(0, Number(input.currentTotal) || 0);
  const currentPaid = Math.max(0, Number(input.currentPaid) || 0);
  const currentDiscount = Math.max(0, Number(input.currentDiscount) || 0);
  const paymentAmount = Math.max(0, Number(input.paymentAmount) || 0);
  const discountAmount = Math.max(0, Number(input.discountAmount) || 0);
  const creditUse = Math.max(0, Number(input.creditUse) || 0);

  const nextDiscount = roundMoney(currentDiscount + discountAmount);
  const nextTotal = roundMoney(Math.max(0, currentTotal - discountAmount));

  // فواتير الكاش تكون مدفوعة فورياً؛ عند إضافة خصم لاحق لا نُبقي paid_amount أعلى من الصافي.
  const paidBase = input.isPos && discountAmount > 0 && currentPaid >= currentTotal - 0.01
    ? Math.min(currentPaid, nextTotal)
    : currentPaid;

  const remainingAfterDiscount = Math.max(0, nextTotal - paidBase);
  const creditApplied = roundMoney(Math.min(creditUse, remainingAfterDiscount));
  const remainingAfterCredit = Math.max(0, remainingAfterDiscount - creditApplied);
  const cashApplied = roundMoney(Math.min(paymentAmount, remainingAfterCredit));
  const cashOver = roundMoney(Math.max(0, paymentAmount - cashApplied));
  const nextPaid = roundMoney(paidBase + creditApplied + cashApplied);
  const newDue = roundMoney(Math.max(0, nextTotal - nextPaid));
  const nextStatus = computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter: nextPaid });

  return { nextDiscount, nextTotal, nextPaid, newDue, nextStatus, creditApplied, cashApplied, cashOver };
}
