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
