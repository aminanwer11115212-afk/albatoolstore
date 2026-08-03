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

const stamp = (t: any): number => {
  const v = t?.created_at || t?.date;
  const ms = v ? new Date(String(v)).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * الفائض منسوباً إلى **الدفعة التي أنتجته**، لا إلى الفاتورة كلّها.
 *
 * ## لماذا لا يكفي الفهرس بالفاتورة
 * فاتورةٌ قيمتها 4,000 دُفعت على دفعتين: 2,000 ثم 3,000. الثانية وحدها تتجاوز
 * المتبقي فتُنتج فائضاً قدره 1,000. ولو نُسب الفائض إلى الفاتورة لقرأ
 * المستخدم **كلا** السطرين مضخّمين: «دفعة 3,000» و«دفعة 4,000» — ومجموعهما
 * 7,000 على فاتورةٍ دُفع فيها 5,000.
 *
 * فالنسبة هنا إلى أقرب دفعةٍ زمنياً على الفاتورة نفسها: قيد الفائض يُكتب في
 * الثانية نفسها التي تُكتب فيها دفعته (`splitPayment` يفصلهما في العملية
 * الواحدة)، والدفعة الواحدة لا تُنسب لها فائضان.
 *
 * ويُبنى الفهرس **قبل** المرور على الحركات: ترتيب القاعدة لا يضمن وصول قيد
 * الفائض قبل قيد دفعته.
 *
 * @returns خريطة مفتاحها معرّف قيد الدفعة وقيمتها فائضها
 */
export function indexLinkedOverpay(
  transactions: any[],
  isOverpay: (t: any) => boolean,
): Map<string, number> {
  const rows = transactions || [];
  const credits = rows.filter(
    (t) => t?.category === "customer_credit" && (Number(t.amount) || 0) > 0 && t.reference_id && isOverpay(t),
  );
  if (credits.length === 0) return new Map();

  const payments = rows.filter((t) => t?.category === "customer_payment" && t.reference_id);
  const map = new Map<string, number>();
  const taken = new Set<string>();

  // الأقدم أوّلاً: الفائض الأقدم يأخذ دفعته الأقرب قبل أن يزاحمه الأحدث.
  for (const credit of [...credits].sort((a, b) => stamp(a) - stamp(b))) {
    const ref = String(credit.reference_id);
    const candidates = payments.filter((p) => String(p.reference_id) === ref && !taken.has(String(p.id)));
    if (candidates.length === 0) continue;
    const at = stamp(credit);
    const nearest = candidates.reduce((best, p) =>
      Math.abs(stamp(p) - at) < Math.abs(stamp(best) - at) ? p : best,
    );
    const key = String(nearest.id);
    taken.add(key);
    map.set(key, r2((map.get(key) || 0) + (Number(credit.amount) || 0)));
  }
  return map;
}
