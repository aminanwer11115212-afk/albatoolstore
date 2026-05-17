// دوال نقية للتحقق من مدخلات الدفعة وحساب حالة الدفع
// EPS هامش تسامح للأخطاء العشرية

export const PAYMENT_EPS = 0.01;

export type PaymentStatus = "pending" | "partial" | "paid";

export interface ValidatePaymentInput {
  amountInput: string | number;
  total: number;
  alreadyPaid: number;
  /** يمنع تكرار نفس الدفعة (نفس المبلغ) خلال نافذة زمنية قصيرة */
  lastPayment?: { amount: number; at: number } | null;
  /** نافذة منع التكرار بالميلي ثانية */
  duplicateWindowMs?: number;
  /** الوقت الحالي (لاختبار قابل للتحكم) */
  now?: number;
}

export interface ValidatePaymentResult {
  ok: boolean;
  error?: string;
  amount?: number;
}

/**
 * يتحقق من صحة مبلغ الدفعة:
 * - رقم صالح وموجب
 * - لا يتجاوز المتبقي (مع هامش تسامح)
 * - لا يكرر آخر دفعة بنفس المبلغ خلال نافذة قصيرة
 */
export function validatePaymentAmount(input: ValidatePaymentInput): ValidatePaymentResult {
  const total = Number(input.total) || 0;
  const paid = Number(input.alreadyPaid) || 0;
  const raw = typeof input.amountInput === "number" ? input.amountInput : parseFloat(String(input.amountInput).trim());

  if (!isFinite(raw) || isNaN(raw)) {
    return { ok: false, error: "أدخل مبلغ صحيح" };
  }
  if (raw <= 0) {
    return { ok: false, error: "أدخل مبلغ صحيح" };
  }
  if (total > 0) {
    const remaining = Math.max(0, total - paid);
    if (raw - remaining > PAYMENT_EPS) {
      return { ok: false, error: `المبلغ يتجاوز المتبقي (${remaining.toFixed(2)})` };
    }
  }

  const windowMs = input.duplicateWindowMs ?? 3000;
  const now = input.now ?? Date.now();
  if (input.lastPayment && Math.abs(input.lastPayment.amount - raw) <= PAYMENT_EPS && now - input.lastPayment.at <= windowMs) {
    return { ok: false, error: "تم تسجيل دفعة بنفس المبلغ للتو، انتظر قليلاً" };
  }

  return { ok: true, amount: raw };
}

/** يحسب حالة الدفع وفق المدفوع والإجمالي مع هامش تسامح */
export function computePaymentStatus(paid: number, total: number): PaymentStatus {
  const p = Number(paid) || 0;
  const t = Number(total) || 0;
  if (t > 0 && p >= t - PAYMENT_EPS) return "paid";
  if (p > PAYMENT_EPS) return "partial";
  return "pending";
}
