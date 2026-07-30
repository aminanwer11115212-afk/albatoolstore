/**
 * عرض كشف حساب العميل مجمّعاً حسب الفاتورة (بديل السجل المسطّح في معاينة/طباعة
 * كشف الحساب العام).
 *
 * كل فاتورة سطر مستقل بقيمتها، ومباشرة تحتها أي تسوية استهلكت من متبقيها عبر
 * شحن رصيد لاحق:
 *
 *   فاتورة 500 — دفع العميل 400 — المتبقي 100
 *     ↳ من شحن رصيد 200: السابق 100 — المدفوع 100 — الفائض بعد التغطية 100
 *
 * **عرض فقط — لا منطق حساب جديد.** المصادر هي `buildCustomerLedger`
 * و`classifyCreditRow` نفسها، والمتبقي لكل فاتورة هو
 * `GREATEST(total - paid_amount, 0)` أي ما تحسبه `recompute_customer_balance`
 * بالضبط، فيطابق المجموع النهائي `net_balance` دائماً.
 *
 * ربط التسوية بشحنتها: الرابط الصريح في `allocation` أولاً
 * (`group_id` / `charge_tx_id`)، وإلا توزيع بنفس أولوية
 * `allocateCreditConsumption` (FIFO/LIFO حسب إعداد الشركة).
 */
import { buildCustomerLedger, type LedgerEvent } from "@/utils/buildCustomerLedger";
import { chargeGroupId, type LedgerTx } from "@/utils/ledgerEntryActions";
import type { CreditConsumptionOrder } from "@/hooks/useCreditConsumptionOrder";

const num = (v: any) => Number(v || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface StatementSettlement {
  id: string;
  date: string;
  /** مرجع شحنة الرصيد التي غُطّي منها (رقم العملية أو المرجع). */
  chargeRef: string | null;
  /** قيمة شحنة الرصيد كاملة. */
  chargeAmount: number | null;
  /** متبقي الفاتورة قبل هذه التسوية. */
  previousRemaining: number;
  /** ما دُفع من الشحنة على هذه الفاتورة. */
  applied: number;
  /** متبقي الفاتورة بعد التسوية. */
  remainingAfter: number;
  /** الفائض المتبقي من الشحنة نفسها بعد هذه التغطية. */
  chargeSurplusAfter: number | null;
}

export interface StatementInvoiceGroup {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  total: number;
  /** إجمالي المدفوع على الفاتورة (نقداً + من الرصيد). */
  paid: number;
  /** ما دُفع نقداً/بنكياً مباشرة. */
  paidDirect: number;
  /** ما غُطّي من شحنات الرصيد. */
  paidFromCredit: number;
  /** المتبقي النهائي = GREATEST(total − paid, 0). */
  remaining: number;
  settlements: StatementSettlement[];
}

export interface StatementCreditCharge {
  id: string;
  date: string;
  ref: string | null;
  amount: number;
  /** ما استُهلك منها على الفواتير. */
  consumed: number;
  /** الفائض المتبقي منها كرصيد دائن للعميل. */
  remaining: number;
}

export interface StatementByInvoice {
  groups: StatementInvoiceGroup[];
  charges: StatementCreditCharge[];
  /** Σ متبقي الفواتير. */
  totalDue: number;
  /** Σ فائض الشحنات غير المستهلَك = الرصيد الدائن. */
  totalCredit: number;
  /** الصافي المعروض = totalDue − totalCredit (يطابق net_balance). */
  closing: number;
  /**
   * فرق بين الصافي المحسوب من الفواتير والشحنات وبين `net_balance` المخزَّن.
   * يُعرض كسطر «تسوية مُرحَّلة» فلا ينحرف المجموع النهائي عن قاعدة البيانات أبداً.
   */
  reconciliation: number;
}

export interface BuildStatementByInvoiceInput {
  invoices?: any[];
  transactions?: any[];
  /** `net_balance` المخزَّن للعميل — مرجع التسوية النهائية. */
  netBalance?: number | null;
  order?: CreditConsumptionOrder;
}

/** مرجع شحنة الرصيد كما يُعرض للعميل. */
function chargeRefOf(t: LedgerTx): string | null {
  return t.allocation?.operation_no || t.reference_no || null;
}

export function buildStatementByInvoice(input: BuildStatementByInvoiceInput): StatementByInvoice {
  const { invoices = [], transactions = [], netBalance, order = "fifo" } = input;

  const ledger = buildCustomerLedger({ invoices, transactions, includeDeleted: false });
  const invoiceById = new Map<string, any>();
  for (const inv of invoices) invoiceById.set(inv.id, inv);

  // ===== 1) شحنات الرصيد (موجبة) مرتّبة زمنياً =====
  const chargeRows: LedgerTx[] = (transactions as LedgerTx[])
    .filter((t) => t.category === "customer_credit" && num(t.amount) > 0)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const chargeState = new Map<string, { row: LedgerTx; amount: number; consumed: number }>();
  for (const c of chargeRows) {
    chargeState.set(c.id, { row: c, amount: r2(num(c.amount)), consumed: 0 });
  }

  /** الشحنة التي غُطّي منها قيد استهلاك — رابط صريح ثم FIFO/LIFO. */
  function sourceChargeFor(consume: LedgerTx, applied: number): string | null {
    const group = chargeGroupId(consume);
    const explicit = chargeRows.find(
      (c) => (group && chargeGroupId(c) === group) || String(consume.allocation?.charge_tx_id || "") === c.id,
    );
    if (explicit) return explicit.id;
    const available = chargeRows
      .map((c) => ({ c, st: chargeState.get(c.id)! }))
      .filter(({ st }) => st.amount - st.consumed > 0.01)
      .sort((a, b) => {
        const cmp = String(a.c.date || "").localeCompare(String(b.c.date || ""));
        return order === "fifo" ? cmp : -cmp;
      });
    // أول شحنة تتسع للمبلغ، وإلا أول شحنة فيها رصيد.
    const fit = available.find(({ st }) => st.amount - st.consumed >= applied - 0.01);
    return (fit || available[0])?.c.id ?? null;
  }

  // ===== 2) مجموعات الفواتير =====
  const groups: StatementInvoiceGroup[] = [];
  const groupByInvoiceId = new Map<string, StatementInvoiceGroup>();
  const invoiceEvents = ledger.events
    .filter((e) => e.kind === "invoice" && !e.excluded && e.invoiceId)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "en", { numeric: true }));

  for (const e of invoiceEvents) {
    const inv = invoiceById.get(e.invoiceId!);
    if (!inv) continue;
    const total = r2(num(inv.total));
    const paid = r2(num(inv.paid_amount));
    const group: StatementInvoiceGroup = {
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number || e.refNumber || "—",
      date: e.date,
      total,
      paid,
      paidDirect: 0,
      paidFromCredit: 0,
      remaining: r2(Math.max(total - paid, 0)),
      settlements: [],
    };
    groups.push(group);
    groupByInvoiceId.set(inv.id, group);
  }

  // ===== 3) التسويات من شحنات الرصيد، تحت فاتورتها =====
  const consumeEvents: LedgerEvent[] = ledger.events
    .filter((e) => e.kind === "credit_used" && e.invoiceId && !e.excluded)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "en", { numeric: true }));

  for (const e of consumeEvents) {
    const group = groupByInvoiceId.get(e.invoiceId!);
    if (!group) continue;
    const applied = r2(e.debit);
    const chargeId = sourceChargeFor((e.raw || {}) as LedgerTx, applied);
    const st = chargeId ? chargeState.get(chargeId) : undefined;
    if (st) st.consumed = r2(st.consumed + applied);
    group.paidFromCredit = r2(group.paidFromCredit + applied);
    group.settlements.push({
      id: e.id,
      date: e.date,
      chargeRef: st ? chargeRefOf(st.row) : null,
      chargeAmount: st ? st.amount : null,
      // يُملأ بعد معرفة كل التسويات (نحسب رجوعاً من المتبقي النهائي).
      previousRemaining: 0,
      applied,
      remainingAfter: 0,
      chargeSurplusAfter: st ? r2(st.amount - st.consumed) : null,
    });
  }

  // متبقي الفاتورة قبل/بعد كل تسوية — يُحسب رجوعاً من المتبقي النهائي
  // الذي هو مصدر الحقيقة (GREATEST(total − paid, 0)).
  for (const g of groups) {
    g.paidDirect = r2(Math.max(g.paid - g.paidFromCredit, 0));
    let after = g.remaining;
    for (let i = g.settlements.length - 1; i >= 0; i--) {
      const s = g.settlements[i];
      s.remainingAfter = after;
      s.previousRemaining = r2(after + s.applied);
      after = s.previousRemaining;
    }
  }

  // ===== 4) الشحنات وفائضها =====
  const charges: StatementCreditCharge[] = chargeRows.map((c) => {
    const st = chargeState.get(c.id)!;
    return {
      id: c.id,
      date: c.date || "",
      ref: chargeRefOf(c),
      amount: st.amount,
      consumed: st.consumed,
      remaining: r2(st.amount - st.consumed),
    };
  });

  const totalDue = r2(groups.reduce((s, g) => s + g.remaining, 0));
  const totalCredit = r2(charges.reduce((s, c) => s + Math.max(c.remaining, 0), 0));
  const computed = r2(totalDue - totalCredit);
  const closing = netBalance != null && !Number.isNaN(Number(netBalance)) ? r2(Number(netBalance)) : computed;

  return {
    groups,
    charges,
    totalDue,
    totalCredit,
    closing,
    reconciliation: r2(closing - computed),
  };
}
