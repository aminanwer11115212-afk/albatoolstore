/**
 * الخصم اليدوي على حساب العميل — قيدُ شحنٍ بمبلغٍ سالب.
 *
 * ## المنطق الذي طلبه صاحب المستودع
 * «إدخال شحن رصيد للعميل بالسالب ليكون عليه»: يُكتب المبلغ سالباً في شاشة
 * شحن الرصيد فيصير خصماً على العميل يزيد دَينه، بدل رصيدٍ له.
 *
 * ## لماذا يكفي قيدٌ واحد
 * القاعدة تحسب رصيد العميل هكذا (راجع `recompute_customer_balance`):
 *
 *     balance        = Σ متبقّي الفواتير غير الملغاة
 *     credit_balance = Σ amount لقيود category = 'customer_credit'
 *     net_balance    = balance − credit_balance        (موجب = عليه)
 *
 * فقيدُ `customer_credit` بمبلغٍ **سالب** يُنقص `credit_balance` فيرفع
 * `net_balance` — أي «عليه» بمقدار الخصم بالضبط. ولا حاجة لعمودٍ جديد ولا
 * دالّةٍ في القاعدة ولا هجرة: الحساب قائمٌ أصلاً ويعمل بالإشارتين.
 *
 * ## ولماذا الوسم لازم
 * استهلاكُ الرصيد (سدادُ فاتورةٍ من رصيدٍ للعميل) يُكتب كذلك `customer_credit`
 * بمبلغٍ سالب — فالرقم وحده لا يفرّق بينهما. والفرق في الأثر: الاستهلاك
 * يقابله سدادٌ فأثره على الكشف صفر، والخصم لا يقابله شيء فأثره زيادةُ الدَّين.
 *
 * فلولا `allocation.kind = "manual_debit"` لقرأ الكشفُ الخصمَ «سداد من رصيد
 * العميل» بأثرٍ صفري بينما رصيد القاعدة يقول «عليه» — كشفٌ لا يطابق رصيده،
 * وهو أسوأ أنواع الاختلاف لأنه يُكتشف متأخّراً عند المحاسبة.
 */

export interface ManualDebitInput {
  customerId: string;
  /** المبلغ كما أُدخل — يجب أن يكون سالباً */
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  method: string;
  accountId?: string | null;
  /** رقم العملية إن كُتب — يُلحق بالوصف */
  referenceNo?: string | null;
}

/** الوسم الفارق بين الخصم اليدوي واستهلاك الرصيد. */
export const MANUAL_DEBIT_KIND = "manual_debit";

/** هل هذا المبلغ خصمٌ على العميل لا شحنَ رصيد؟ */
export function isCustomerDebitAmount(amount: unknown): boolean {
  return (Number(amount) || 0) < 0;
}

/**
 * صفُّ `transactions` للخصم اليدوي.
 *
 * المبلغ يُكتب **سالباً كما أُدخل** — لا يُقلَب ولا يُؤخذ مطلقه: الإشارة هي
 * التي تحرّك الرصيد في القاعدة.
 */
export function buildManualDebitPayload(input: ManualDebitInput): Record<string, any> {
  const amount = Number(input.amount) || 0;
  const ref = (input.referenceNo || "").trim();
  return {
    type: "expense",
    category: "customer_credit",
    amount,
    method: input.method,
    date: input.date,
    customer_id: input.customerId,
    account_id: input.accountId || null,
    description: ref ? `خصم على حساب العميل — ${ref}` : "خصم على حساب العميل",
    allocation: { kind: MANUAL_DEBIT_KIND },
  };
}

/**
 * أثر الخصم على صافي الحساب — بإشارة الدفاتر: موجب = عليه.
 * يُستعمل في المعاينة قبل الحفظ، وهو نفسه ما تحسبه القاعدة بعده.
 */
export function netAfterDebit(netBefore: number, amount: number): number {
  const before = Number(netBefore) || 0;
  const amt = Number(amount) || 0;
  return Math.round((before - amt) * 100) / 100;
}
