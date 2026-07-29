/**
 * «كشف تفصيلي تسويي» — منطق نقي (بدون React/Supabase) لبناء خط زمني تراكمي
 * لحساب العميل: كل فاتورة صف مدين، وكل دفعة/شحن رصيد صف دائن، مع رصيد تراكمي
 * وملاحظة تسوية مشروحة لكل صف.
 *
 * الثابت المحاسبي: آخر رصيد تراكمي = balance − credit_balance = صافي حساب العميل
 * (موجب = مطلوب من العميل، سالب = رصيد دائن له). قيود التسوية من الرصيد
 * (customer_payment بطريقة credit_balance + customer_credit سالب) يحصل بينها
 * تعادل تام، لذا تُطوى داخل ملاحظة الصف المصدر بدل عرضها كصفوف مستقلة.
 */

export const LEDGER_EPS = 0.01;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface LedgerInvoice {
  id: string;
  invoice_number?: string | null;
  date?: string | null;
  created_at?: string | null;
  total?: number | null;
  paid_amount?: number | null;
  status?: string | null;
}

export interface LedgerTransaction {
  id: string;
  date?: string | null;
  created_at?: string | null;
  category?: string | null;
  method?: string | null;
  amount?: number | null;
  reference_id?: string | null;
  description?: string | null;
  allocation?: any;
}

export type LedgerTone = "default" | "success" | "warning" | "info";

export interface LedgerRow {
  key: string;
  kind: "invoice" | "payment" | "credit";
  date: string;
  /** البيان */
  label: string;
  debit: number;
  credit: number;
  /** الرصيد التراكمي بعد هذا الصف */
  balance: number;
  /** ملاحظات التسوية */
  note: string;
  tone: LedgerTone;
  invoiceNumber?: string | null;
  refId?: string | null;
}

export interface SettlementLedger {
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
}

const ts = (e: { date?: string | null; created_at?: string | null }) =>
  `${String(e.date || e.created_at || "").slice(0, 10)}T${String(e.created_at || "").slice(11, 23)}`;

const isCreditUsed = (t: LedgerTransaction) =>
  t.allocation?.kind === "credit_used" ||
  (t.category === "customer_payment" && t.method === "credit_balance");

/** استخراج التسويات التلقائية المرتبطة بمصدر (فاتورة فائض أو مجموعة شحن). */
export interface SettlementEntry {
  invoiceId: string | null;
  invoiceNumber: string | null;
  applied: number;
  fullyPaid: boolean;
}

export function collectSettlements(transactions: LedgerTransaction[]): Map<string, SettlementEntry[]> {
  const map = new Map<string, SettlementEntry[]>();
  for (const t of transactions || []) {
    if (t.category !== "customer_payment" || !isCreditUsed(t)) continue;
    const a = t.allocation || {};
    const ref = a.source_ref ? String(a.source_ref) : null;
    if (!ref) continue;
    const entry: SettlementEntry = {
      invoiceId: a.invoice_id ? String(a.invoice_id) : t.reference_id || null,
      invoiceNumber: a.invoice_number ? String(a.invoice_number) : null,
      applied: r2(Number(a.applied ?? t.amount ?? 0)),
      fullyPaid: String(a.new_status || "") === "paid",
    };
    const arr = map.get(ref) || [];
    arr.push(entry);
    map.set(ref, arr);
  }
  return map;
}

function noteForCreditRow(
  settlements: SettlementEntry[],
  balanceAfter: number,
): { note: string; tone: LedgerTone } {
  const applied = r2(settlements.reduce((s, e) => s + e.applied, 0));
  const parts: string[] = [];
  let tone: LedgerTone = "info";

  if (applied > LEDGER_EPS) {
    if (balanceAfter <= LEDGER_EPS) {
      parts.push("تم تصفير المديونية السابقة كاملة");
      tone = "success";
    } else {
      const partial = settlements.filter((e) => !e.fullyPaid);
      const full = settlements.filter((e) => e.fullyPaid);
      if (full.length) {
        parts.push(`سُدِّدت بالكامل: ${full.map((e) => e.invoiceNumber || "—").join("، ")}`);
      }
      for (const e of partial) {
        parts.push(`خصم من متبقي الفاتورة رقم ${e.invoiceNumber || "—"}`);
      }
      if (!parts.length) parts.push(`تسوية تلقائية بقيمة ${applied.toLocaleString()}`);
      tone = "success";
    }
  }

  if (balanceAfter < -LEDGER_EPS) {
    parts.push(`ويتبقى ${Math.abs(balanceAfter).toLocaleString()} رصيد دائن للعميل`);
    if (tone === "info") tone = "info";
  }

  if (!parts.length) parts.push("دفعة/رصيد دائن بدون تسوية تلقائية");
  return { note: parts.join(" — "), tone };
}

export function buildSettlementLedger(input: {
  invoices: LedgerInvoice[];
  transactions: LedgerTransaction[];
}): SettlementLedger {
  const invoices = input.invoices || [];
  const transactions = input.transactions || [];
  const settlementsBySource = collectSettlements(transactions);

  // الفاتورة → معلومات التسوية التلقائية التي سدّدتها (لعرض المصدر بجانب حالتها)
  const autoByInvoice = new Map<string, { text: string }>();
  for (const t of transactions) {
    if (t.category !== "customer_payment" || !isCreditUsed(t)) continue;
    const a = t.allocation || {};
    if (a.auto !== true) continue;
    const invId = a.invoice_id ? String(a.invoice_id) : t.reference_id || "";
    if (!invId) continue;
    const text =
      a.source_kind === "invoice_overpay"
        ? `من دفعة فاتورة رقم ${a.source_invoice_number || "—"}`
        : `من شحن رصيد بتاريخ ${a.source_date || String(t.date || "").slice(0, 10)}`;
    autoByInvoice.set(invId, { text });
  }

  type Ev = { sort: string; build: (bal: number) => LedgerRow };
  const events: Ev[] = [];

  for (const inv of invoices) {
    const total = r2(inv.total);
    const paid = r2(inv.paid_amount);
    const remaining = r2(Math.max(total - paid, 0));
    const num = inv.invoice_number || "—";
    const auto = autoByInvoice.get(inv.id);
    events.push({
      sort: ts(inv) + "|0|" + inv.id,
      build: (bal) => {
        let note: string;
        let tone: LedgerTone = "default";
        if (remaining > LEDGER_EPS) {
          note = `متبقي ${remaining.toLocaleString()} (مفتوحة)`;
          tone = "warning";
        } else if (auto) {
          note = `مسددة بالكامل (${auto.text})`;
          tone = "success";
        } else {
          note = "مسددة بالكامل";
          tone = "success";
        }
        return {
          key: `inv-${inv.id}`,
          kind: "invoice",
          date: String(inv.date || inv.created_at || "").slice(0, 10),
          label: `فاتورة رقم ${num}`,
          debit: total,
          credit: 0,
          balance: bal,
          note,
          tone,
          invoiceNumber: inv.invoice_number || null,
          refId: inv.id,
        };
      },
    });
  }

  for (const t of transactions) {
    const cat = t.category || "";
    if (cat !== "customer_payment" && cat !== "customer_credit") continue;
    // قيود التسوية من الرصيد تتعادل تماماً — تُطوى في ملاحظة الصف المصدر
    if (isCreditUsed(t) || (cat === "customer_credit" && Number(t.amount || 0) < 0)) continue;

    const amount = r2(t.amount);
    if (Math.abs(amount) <= LEDGER_EPS) continue;
    const isCharge = cat === "customer_credit";
    const sourceKey = isCharge
      ? String(t.allocation?.group_id || t.allocation?.invoice_id || t.reference_id || t.id)
      : String(t.reference_id || t.id);
    const linked = settlementsBySource.get(sourceKey) || settlementsBySource.get(String(t.reference_id || "")) || [];
    const label = isCharge
      ? t.allocation?.kind === "overpay_surplus"
        ? `فائض دفعة${t.allocation?.invoice_number ? ` — فاتورة ${t.allocation.invoice_number}` : ""}`
        : "شحن رصيد للعميل"
      : `دفعة${t.reference_id ? " على فاتورة" : ""}${t.description ? "" : ""}`;

    events.push({
      sort: ts(t) + "|1|" + t.id,
      build: (bal) => {
        const { note, tone } = linked.length
          ? noteForCreditRow(linked, bal)
          : bal < -LEDGER_EPS
            ? { note: `رصيد دائن متاح ${Math.abs(bal).toLocaleString()}`, tone: "info" as LedgerTone }
            : { note: bal <= LEDGER_EPS ? "تم تصفير المديونية السابقة كاملة" : `متبقي على الحساب ${bal.toLocaleString()}`, tone: (bal <= LEDGER_EPS ? "success" : "default") as LedgerTone };
        return {
          key: `tx-${t.id}`,
          kind: isCharge ? "credit" : "payment",
          date: String(t.date || t.created_at || "").slice(0, 10),
          label,
          debit: 0,
          credit: amount,
          balance: bal,
          note,
          tone,
          invoiceNumber: t.allocation?.invoice_number || null,
          refId: t.reference_id || null,
        };
      },
    });
  }

  events.sort((a, b) => a.sort.localeCompare(b.sort));

  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: LedgerRow[] = [];
  for (const ev of events) {
    // نبني الصف مرتين منطقياً: نحسب الرصيد أولاً ثم نمرّره لصياغة الملاحظة
    const probe = ev.build(running);
    running = r2(running + probe.debit - probe.credit);
    totalDebit = r2(totalDebit + probe.debit);
    totalCredit = r2(totalCredit + probe.credit);
    rows.push(ev.build(running));
  }

  return { rows, totalDebit, totalCredit, finalBalance: running };
}
