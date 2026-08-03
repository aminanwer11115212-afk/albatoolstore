/**
 * صياغة الدفعة كما دفعها العميل — لا كما قُسِّمت في الدفاتر.
 *
 * ## العطل الذي عالجه
 * دفعةُ 5,000 على فاتورةٍ قيمتها 4,000 تُكتب في القاعدة قيدَين:
 * `customer_payment` بـ4,000 و`customer_credit` بـ1,000 (راجع `splitPayment`).
 * وهذا صحيحٌ محاسبياً، لكنّ العميل لم يدفع مرّتين — دفع 5,000 دفعةً واحدة.
 * فكان يقرأ في المعاملات «دفعة 4,000» ويسأل: أين الألف؟
 *
 * الحلّ في العرض لا في القيود: يبقى القيدان كما هما — لا يُلمس رصيدٌ ولا
 * توزيع — ويُذكر في نصّ الدفعة ما دُفع كاملاً وعلى أي قيمة، وأين ذهب الفائض.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n: number) => Math.abs(r2(n)).toLocaleString();

export interface PaymentDisplayInput {
  /** ما طُبِّق على الفاتورة (قيد `customer_payment`) */
  applied: number;
  /** الفائض المرتبط بنفس الفاتورة (قيد `customer_credit`) */
  surplus?: number;
  /** رقم الفاتورة — يغيب في الدفعة غير المرتبطة */
  invoiceNumber?: string | null;
  /** قيمة الفاتورة */
  invoiceTotal?: number | null;
}

/** إجمالي ما دفعه العميل في العملية الواحدة. */
export function fullPaidAmount(input: PaymentDisplayInput): number {
  return r2(Math.abs(r2(input.applied)) + Math.max(0, r2(input.surplus || 0)));
}

/**
 * بيان الدفعة بلغة الدفاتر: «دفعة 5,000 على فاتورة INV-1 (4,000)».
 * وبلا فائض ولا قيمةٍ معروفة يعود إلى الصيغة القديمة نفسها.
 */
export function paymentStatement(input: PaymentDisplayInput): string {
  const full = fullPaidAmount(input);
  const total = Number(input.invoiceTotal) || 0;
  if (!input.invoiceNumber) return `دفعة ${money(full)} من العميل`;
  const on = total > 0 ? ` (${money(total)})` : "";
  return `دفعة ${money(full)} على فاتورة ${input.invoiceNumber}${on}`;
}

/** الجملة بصيغة مخاطبة العميل — لمن لا يقرأ لغة المحاسبة. */
export function paymentCustomerText(input: PaymentDisplayInput & { via?: string; operationNo?: string | null }): string {
  const full = fullPaidAmount(input);
  const surplus = Math.max(0, r2(input.surplus || 0));
  const total = Number(input.invoiceTotal) || 0;
  const via = input.via ? ` عن طريق ${input.via}` : "";
  const op = input.operationNo ? ` — رقم العملية ${input.operationNo}` : "";
  const on = input.invoiceNumber && total > 0
    ? ` على فاتورة ${input.invoiceNumber} قيمتها ${money(total)}`
    : input.invoiceNumber ? ` على فاتورة ${input.invoiceNumber}` : "";
  const extra = surplus > 0.009 ? ` — منها ${money(surplus)} أُضيفت إلى رصيدكم لدينا` : "";
  return `دفعتم ${money(full)}${on}${via}${op}${extra}`;
}

/**
 * الفائض المرتبط بكل فاتورة، مفهرساً قبل المرور على الحركات.
 *
 * لا يصلح بناؤه أثناء المرور: ترتيب الحركات القادم من القاعدة لا يضمن وصول
 * قيد الفائض قبل قيد الدفعة، فقد يُصاغ نصّ الدفعة قبل أن يُعرف فائضها.
 */
export function indexLinkedOverpay(
  transactions: any[],
  isOverpay: (t: any) => boolean,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transactions || []) {
    if (t?.category !== "customer_credit") continue;
    const amt = Number(t.amount) || 0;
    if (amt <= 0 || !t.reference_id || !isOverpay(t)) continue;
    const key = String(t.reference_id);
    map.set(key, r2((map.get(key) || 0) + amt));
  }
  return map;
}
