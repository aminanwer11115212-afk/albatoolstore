/**
 * منطق تعديل/حذف قيود دفتر العميل — دوال نقية بلا أي وصول لقاعدة البيانات.
 *
 * تُستخدم في تبويب «سجل المعاملات» بـ `CustomerStatementPage` لتحديد:
 *   - أي القيود قابل للتعديل وأيها قابل للحذف،
 *   - هل استُهلك شحن الرصيد (فلا يُحذف مباشرة)،
 *   - أثر العملية على الرصيد قبل تنفيذها (رصيد حالي ← رصيد بعد التنفيذ).
 *
 * قاعدة الإشارة هي نفسها في `netBalanceOf` و`buildCustomerLedger`:
 *   الرصيد الصافي = المديونية − الرصيد الدائن، موجب «عليه» وسالب «له».
 *
 * التصنيف يتبع `buildCustomerLedger`/`classifyCreditRow` حرفياً:
 *   customer_payment            → دفعة (مرتبطة بفاتورة أو مستقلة)
 *   customer_credit  amount > 0 → شحن رصيد
 *   customer_credit  amount < 0 → استهلاك رصيد (credit_consume)
 */
import { extractOperationNo } from "@/utils/buildCustomerLedger";

export type LedgerEntryKind =
  | "payment_invoice"
  | "payment_standalone"
  | "payment_from_credit"
  | "credit_charge"
  | "credit_consume"
  | "other";

export interface LedgerTx {
  id: string;
  customer_id?: string | null;
  category?: string | null;
  method?: string | null;
  amount?: number | null;
  date?: string | null;
  description?: string | null;
  reference_id?: string | null;
  reference_no?: string | null;
  allocation?: any;
}

const num = (v: any) => Number(v || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function classifyLedgerEntry(t: LedgerTx): LedgerEntryKind {
  const amt = num(t.amount);
  if (t.category === "customer_payment") {
    if (t.method === "credit_balance") return "payment_from_credit";
    return t.reference_id ? "payment_invoice" : "payment_standalone";
  }
  if (t.category === "customer_credit") {
    return amt < 0 ? "credit_consume" : "credit_charge";
  }
  return "other";
}

/** التعديل متاح للدفعات المرتبطة بفاتورة ولشحنات الرصيد — لا لقيود الاستهلاك. */
export function isEditableEntry(t: LedgerTx): boolean {
  const kind = classifyLedgerEntry(t);
  return kind === "payment_invoice" || kind === "credit_charge";
}

/** الحذف متاح لنفس القيود القابلة للتعديل؛ الاستهلاك يُعكَس من شحنته لا من هنا. */
export function isDeletableEntry(t: LedgerTx): boolean {
  return isEditableEntry(t);
}

/** مُعرِّف مجموعة الشحنة إن وُجد (شحنات `record_customer_charge`). */
export function chargeGroupId(t: LedgerTx): string | null {
  const g = t.allocation?.group_id;
  return g ? String(g) : null;
}

/** مرجع الشحنة الذي يظهر في بيان الاستهلاك «خصم من شحن رصيد …». */
export function chargeReference(t: LedgerTx): string | null {
  return t.allocation?.operation_no || t.reference_no || extractOperationNo(t.description) || null;
}

/**
 * صفوف الاستهلاك المرتبطة بشحنة معيّنة — بنفس الربط الذي يستخدمه
 * `buildCustomerLedger` عند بناء سطر «خصم من شحن رصيد …»، مع رابطين
 * أقوى منه إن توفّرا: مجموعة الشحنة ومُعرِّف الشحنة في `allocation`.
 */
export function findLinkedConsumptions(charge: LedgerTx, transactions: LedgerTx[]): LedgerTx[] {
  const group = chargeGroupId(charge);
  const ref = chargeReference(charge);
  return transactions.filter((t) => {
    if (t.id === charge.id) return false;
    if (classifyLedgerEntry(t) !== "credit_consume") return false;
    if (charge.customer_id && t.customer_id && t.customer_id !== charge.customer_id) return false;
    if (group && chargeGroupId(t) === group) return true;
    if (String(t.allocation?.charge_tx_id || "") === charge.id) return true;
    if (ref && extractOperationNo(t.description) === ref) return true;
    return false;
  });
}

export type DeletabilityReason = "ok" | "explicit_consumption" | "insufficient_remaining_credit";

export interface CreditDeletability {
  canDelete: boolean;
  reason: DeletabilityReason;
  /** ما استُهلك من هذه الشحنة تحديداً (عبر الربط الصريح). */
  linkedConsumed: number;
  /** الرصيد الدائن المتبقي للعميل كله = Σ شحنات − Σ استهلاك. */
  availableCredit: number;
  linkedConsumptions: LedgerTx[];
}

/**
 * هل تُحذف هذه الشحنة مباشرة؟
 *
 * تُمنع في حالتين: وجود صفوف استهلاك مرتبطة بها صراحةً، أو أن الرصيد الدائن
 * المتبقي للعميل أقل من قيمتها — عندها استُهلك جزء منها فعلياً ولو عبر قيود
 * غير مربوطة صراحةً، وحذفها كان سيجعل الرصيد الدائن سالباً.
 */
export function creditChargeDeletability(charge: LedgerTx, transactions: LedgerTx[]): CreditDeletability {
  const linkedConsumptions = findLinkedConsumptions(charge, transactions);
  const linkedConsumed = r2(linkedConsumptions.reduce((s, t) => s + Math.abs(num(t.amount)), 0));
  const availableCredit = r2(
    transactions
      .filter((t) => t.category === "customer_credit")
      .filter((t) => !charge.customer_id || !t.customer_id || t.customer_id === charge.customer_id)
      .reduce((s, t) => s + num(t.amount), 0),
  );
  const amount = r2(num(charge.amount));

  if (linkedConsumptions.length > 0) {
    return { canDelete: false, reason: "explicit_consumption", linkedConsumed, availableCredit, linkedConsumptions };
  }
  if (availableCredit < amount - 0.01) {
    return { canDelete: false, reason: "insufficient_remaining_credit", linkedConsumed, availableCredit, linkedConsumptions };
  }
  return { canDelete: true, reason: "ok", linkedConsumed, availableCredit, linkedConsumptions };
}

export const DELETABILITY_MESSAGE: Record<DeletabilityReason, string> = {
  ok: "",
  explicit_consumption:
    "استُهلك جزء من هذه الشحنة على فواتير — راجع الاستهلاك وألغِ التوزيع أولاً، ثم أعد المحاولة.",
  insufficient_remaining_credit:
    "الرصيد الدائن المتبقي للعميل أقل من قيمة هذه الشحنة، ما يعني أنها استُهلكت جزئياً — راجع الاستهلاك أولاً.",
};

export interface BalanceProjection {
  /** الرصيد الصافي الحالي (موجب «عليه»، سالب «له»). */
  before: number;
  after: number;
  delta: number;
}

/**
 * أثر حذف قيد على الرصيد الصافي للعميل.
 *
 * حذف دفعة يرفع المديونية بقيمتها (المدفوع ينقص) ⇒ الصافي يزيد.
 * حذف شحن رصيد يُنقص الرصيد الدائن بقيمته ⇒ الصافي يزيد أيضاً.
 * في الحالتين: الصافي بعد الحذف = الصافي قبله + قيمة القيد.
 */
export function projectDeleteImpact(entry: LedgerTx, currentNet: number): BalanceProjection {
  const kind = classifyLedgerEntry(entry);
  const amount = Math.abs(num(entry.amount));
  const delta = kind === "payment_invoice" || kind === "payment_standalone" || kind === "credit_charge" ? amount : 0;
  return { before: r2(currentNet), after: r2(currentNet + delta), delta: r2(delta) };
}

/** أثر تعديل مبلغ قيد (دفعة أو شحنة) على الرصيد الصافي. */
export function projectEditImpact(entry: LedgerTx, currentNet: number, newAmount: number): BalanceProjection {
  const oldAmount = Math.abs(num(entry.amount));
  const delta = r2(oldAmount - (Number(newAmount) || 0));
  return { before: r2(currentNet), after: r2(currentNet + delta), delta };
}

/* ────────────────────────────────────────────────────────────────────────────
 * قدرات الحركة — المصدر الواحد الذي تقرأ منه الواجهة
 *
 * كانت شروط «هل يُعدَّل / هل يُحذف» متفرّقة في الشاشات، فتختلف عن حرّاس الـRPC
 * فيرى المستخدم زراً يفشل عند الضغط، أو يُحجب عنه فعل تسمح به القاعدة فعلاً.
 * هذه الدالة تجمعها في مكان واحد **مطابقاً حرفياً** لما ترفضه الدوال في
 * القاعدة، واختبار في `src/test/ledgerEntryActions.test.ts` يقارن الاثنين:
 *
 *   revise_invoice_payment            → يرفض بلا فاتورة مرتبطة (no_linked_invoice)
 *                                       ويرفض الاستهلاك (credit_consumption_not_editable)
 *   cancel_invoice_payment            → يقبل الدفعة المستقلة، ويرفض الاستهلاك
 *   revise_customer_charge            → يحتاج allocation.group_id، ويرفض المستهلَكة
 *   delete_customer_credit_entry      → يرفض المستهلَكة وما يُنقص الرصيد تحت الصفر
 * ──────────────────────────────────────────────────────────────────────────── */

export type BlockReason =
  | "credit_consumption"
  | "no_linked_invoice"
  | "no_charge_group"
  | "explicit_consumption"
  | "insufficient_remaining_credit"
  | "not_supported";

export interface MovementCapabilities {
  kind: LedgerEntryKind;
  /** عنوان عربي قصير للحركة كما تظهر في القائمة */
  label: string;
  canEdit: boolean;
  canDelete: boolean;
  /** سبب منع التعديل — `null` إن كان متاحاً */
  editBlockedBy: BlockReason | null;
  /** سبب منع الحذف — `null` إن كان متاحاً */
  deleteBlockedBy: BlockReason | null;
  /**
   * الحذف مسموح لكنه يعكس عمليات أخرى معه — يُعرض تحذيراً قبل التنفيذ.
   * يُستعمل لشحنة استُهلك منها: حذفها يُنقص `paid_amount` لفواتيرها.
   */
  deleteWarning?: BlockReason | null;
}

export const MOVEMENT_LABEL: Record<LedgerEntryKind, string> = {
  payment_invoice: "دفعة على فاتورة",
  payment_standalone: "دفعة مستقلة",
  payment_from_credit: "سداد من الرصيد",
  credit_charge: "شحن رصيد",
  credit_consume: "استهلاك رصيد",
  other: "حركة مالية",
};

export const BLOCK_MESSAGE: Record<BlockReason, string> = {
  credit_consumption:
    "قيد استهلاك رصيد — يُعكَس بحذف شحنته أو بإلغاء سداد الفاتورة، لا من هنا",
  no_linked_invoice: "دفعة غير مرتبطة بفاتورة — تُحذف ولا تُعدَّل",
  no_charge_group: "شحنة بلا مجموعة تخصيص (فائض تلقائي) — تُحذف ولا تُعدَّل",
  explicit_consumption: "استُهلك من هذه الشحنة على فواتير — ألغِ الاستهلاك أولاً",
  insufficient_remaining_credit:
    "الرصيد الدائن المتبقي أقل من قيمة الشحنة — حذفها يجعله سالباً",
  not_supported: "هذا النوع من الحركات لا يُعدَّل ولا يُحذف من كشف الحساب",
};

/**
 * ما الذي يُسمح به على هذه الحركة، ولماذا لا إن مُنع.
 * `transactions` لازمة لفحص استهلاك شحنات الرصيد.
 */
export function movementCapabilities(
  t: LedgerTx,
  transactions: LedgerTx[],
): MovementCapabilities {
  const kind = classifyLedgerEntry(t);
  const base = { kind, label: MOVEMENT_LABEL[kind] };

  if (kind === "payment_invoice") {
    return { ...base, canEdit: true, canDelete: true, editBlockedBy: null, deleteBlockedBy: null };
  }

  // الدفعة المستقلة: القاعدة تحذفها بلا مشكلة لكن التعديل يحتاج فاتورة مرتبطة.
  if (kind === "payment_standalone") {
    return {
      ...base,
      canEdit: false,
      canDelete: true,
      editBlockedBy: "no_linked_invoice",
      deleteBlockedBy: null,
    };
  }

  if (kind === "payment_from_credit" || kind === "credit_consume") {
    return {
      ...base,
      canEdit: false,
      canDelete: false,
      editBlockedBy: "credit_consumption",
      deleteBlockedBy: "credit_consumption",
    };
  }

  if (kind === "credit_charge") {
    const guard = creditChargeDeletability(t, transactions);
    const hasGroup = !!chargeGroupId(t);
    // **الحذف متاح لأي شحنة** — `delete_customer_credit_entry` صارت تعكس
    // استهلاكها على الفواتير أولاً ثم تحذفها، فالاستهلاك خطوة تسبق الحذف لا
    // مانع له. أمّا التعديل فيبقى مشروطاً: يعيد إنشاء المجموعة، فيحتاج مجموعة
    // وشحنة غير مستهلَكة معاً حتى لا يُعاد بناء ما استُهلك نصفه.
    const editBlockedBy: BlockReason | null = !hasGroup
      ? "no_charge_group"
      : guard.canDelete
        ? null
        : (guard.reason as BlockReason);
    return {
      ...base,
      canEdit: editBlockedBy === null,
      canDelete: true,
      editBlockedBy,
      deleteBlockedBy: null,
      /** تحذير يُعرض قبل الحذف — ليس منعاً */
      deleteWarning: guard.canDelete ? null : (guard.reason as BlockReason),
    };
  }

  return {
    ...base,
    canEdit: false,
    canDelete: false,
    editBlockedBy: "not_supported",
    deleteBlockedBy: "not_supported",
  };
}

/** الحركات التي يستطيع المستخدم فعل شيء بها — ما يُعرض في نافذة التعديل. */
export function actionableMovements(
  transactions: LedgerTx[],
): Array<{ tx: LedgerTx; caps: MovementCapabilities }> {
  return transactions
    .map((tx) => ({ tx, caps: movementCapabilities(tx, transactions) }))
    .filter(({ caps }) => caps.canEdit || caps.canDelete)
    .sort((a, b) => String(b.tx.date || "").localeCompare(String(a.tx.date || "")));
}

/**
 * أصل قيد الاستهلاك: الشحنة التي خُصم منها، والفاتورة التي طُبِّق عليها.
 *
 * رسالة «يُعكَس بحذف شحنته» بلا تحديد أيّ شحنة هي طريق مسدود أمام المستخدم.
 * هذه الدالة تجد الأصل فعلاً فتصير الرسالة قابلة للتنفيذ — وإن لم تجده، فذاك
 * خبر مهم بذاته: القيد يتيم، أي أن شحنته حُذفت وبقي هو.
 */
export interface ConsumptionOrigin {
  /** الشحنة التي خُصم منها هذا الاستهلاك — `null` إن لم تُوجد في القائمة */
  charge: LedgerTx | null;
  /** مُعرِّف الفاتورة التي طُبِّق عليها */
  invoiceId: string | null;
  /** لا شحنة له في القائمة ⇒ قيد يتيم يحتاج مراجعة */
  orphan: boolean;
}

export function consumptionOrigin(t: LedgerTx, transactions: LedgerTx[]): ConsumptionOrigin {
  const kind = classifyLedgerEntry(t);
  const invoiceId = t.reference_id ? String(t.reference_id) : null;
  if (kind !== "credit_consume" && kind !== "payment_from_credit") {
    return { charge: null, invoiceId, orphan: false };
  }
  const group = chargeGroupId(t);
  const chargeTxId = t.allocation?.charge_tx_id ? String(t.allocation.charge_tx_id) : null;
  const ref = chargeReference(t);

  const charge =
    transactions.find(
      (c) =>
        c.id !== t.id &&
        classifyLedgerEntry(c) === "credit_charge" &&
        (c.id === chargeTxId ||
          (!!group && chargeGroupId(c) === group) ||
          (!!ref && chargeReference(c) === ref)),
    ) || null;

  return { charge, invoiceId, orphan: !charge };
}
