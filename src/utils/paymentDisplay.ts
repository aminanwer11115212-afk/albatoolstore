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
 * قيدُ دفعةٍ يقبل ضمَّ فائضه إليه.
 *
 * المسار الأساسي (`CustomerPaymentDialog`) يكتب `category: "customer_payment"`.
 * وبقيت في القاعدة قيودٌ من مسار الدفع السريع في صفحة الفاتورة كُتبت **بلا
 * فئة** — وهي دفعاتٌ في كل شيء إلا الوسم. فلو اشترطنا الفئة وحدها لبقيت
 * دفعات المستخدم القديمة مقسومةً في جدول المعاملات وهو ما يشكو منه.
 */
const isPaymentRow = (t: any): boolean => {
  if (!t?.reference_id) return false;
  if (t.category === "customer_payment") return true;
  return !t.category && t.type === "income";
};

/**
 * الفائض منسوباً إلى دفعته، مع **معرّفات قيود الفائض التي ضُمَّت**.
 *
 * `indexLinkedOverpay` تُرجع الخريطة وحدها لأن كشف الحساب لا يحتاج غيرها.
 * أمّا جدول المعاملات فيحذف القيد المضموم من العرض، فيحتاج أن يعرف أيَّها
 * ضُمَّ — ومن هنا هذه الدالّة الأمّ، لا نسخةٌ ثانيةٌ من منطق المزاوجة.
 */
export function pairLinkedOverpay(
  transactions: any[],
  isOverpay: (t: any) => boolean,
): { byPayment: Map<string, number>; foldedCreditIds: Set<string> } {
  const rows = transactions || [];
  const byPayment = new Map<string, number>();
  const foldedCreditIds = new Set<string>();

  const credits = rows.filter(
    (t) => t?.category === "customer_credit" && (Number(t.amount) || 0) > 0 && t.reference_id && isOverpay(t),
  );
  if (credits.length === 0) return { byPayment, foldedCreditIds };

  const payments = rows.filter(isPaymentRow);
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
    byPayment.set(key, r2((byPayment.get(key) || 0) + (Number(credit.amount) || 0)));
    foldedCreditIds.add(String(credit.id));
  }
  return { byPayment, foldedCreditIds };
}

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
  return pairLinkedOverpay(transactions, isOverpay).byPayment;
}

/**
 * جدول المعاملات: الدفعة الزائدة **لا تُقسم أبداً** — سطرٌ واحد بتفاصيل بسيطة.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * دفعةُ 5,000 على فاتورةٍ بـ4,000 تُكتب قيدَين، فيقرأ في «المعاملات» سطرَين
 * لعمليةٍ واحدة: 4,000 ثم 1,000. والعميل دفع مرّةً واحدة — فيبدو الجدول كأن
 * فيه دفعتين، ويُحسب في الذهن مرّتين.
 *
 * ## القاعدة
 * الدفاتر لا تُلمس: القيدان يبقيان في القاعدة كما هما، وأثرهما على الحساب
 * والرصيد بحاله. الدمج **عرضٌ فقط**، وهو محفوظ الجمع: 4,000 + 1,000 = 5,000
 * في سطرٍ واحد، فلا يتغيّر مجموع أي عمود.
 *
 * @returns القائمة نفسها بترتيبها، بلا قيود الفائض المضمومة، وسطرُ الدفعة
 *          يحمل المبلغ كاملاً و`overpaySurplus` لمن أراد ذكر مصير الفائض.
 */
export type FoldedTx<T> = T & {
  /** الفائض المضموم إلى هذا السطر — يغيب في الأسطر العادية */
  overpaySurplus?: number;
  /** مبلغ القيد كما هو **في القاعدة** — لكل من يكتب لا لمن يقرأ */
  overpayApplied?: number;
};

export function foldOverpayTransactions<T extends Record<string, any>>(
  transactions: T[],
  isOverpay: (t: any) => boolean,
): Array<FoldedTx<T>> {
  const rows = transactions || [];
  if (rows.length === 0) return [];
  const { byPayment, foldedCreditIds } = pairLinkedOverpay(rows, isOverpay);
  if (byPayment.size === 0) return rows as Array<FoldedTx<T>>;

  const out: Array<FoldedTx<T>> = [];
  for (const t of rows) {
    if (foldedCreditIds.has(String(t.id))) continue; // ضُمَّ إلى دفعته
    const surplus = byPayment.get(String(t.id)) || 0;
    if (surplus <= 0.009) { out.push(t as FoldedTx<T>); continue; }

    const applied = r2(Number(t.amount) || 0);
    const full = r2(Math.abs(applied) + surplus);
    // الأعمدة المحسوبة تُنقل معها: الجدول يعرض `debit || amount`، فلو بقي
    // `debit` على المطبَّق وحده لعاد الرقم مقسوماً من بابٍ آخر.
    //
    // و`overpayApplied` يحفظ المبلغ الأصلي: المبلغ المدموج رقمٌ **يُقرأ**،
    // فمن يكتبه إلى القاعدة (حوار تعديل الدفعة) يكتب 5,000 مكان 4,000
    // فيُفسد الفاتورة. كل كاتبٍ يأخذ من هنا لا من `amount`.
    const merged: any = { ...t, amount: full, overpaySurplus: surplus, overpayApplied: applied };
    if (Number(t.debit) > 0) merged.debit = full;
    if (Number(t.credit) > 0) merged.credit = full;
    out.push(merged);
  }
  return out;
}

/** ذيلٌ قصير يُلحق بوصف الدفعة المدموجة: أين ذهب الفائض. */
export function overpaySurplusNote(surplus: unknown): string {
  const s = Math.max(0, r2(Number(surplus) || 0));
  return s > 0.009 ? ` — منها ${money(s)} رصيد للعميل` : "";
}
