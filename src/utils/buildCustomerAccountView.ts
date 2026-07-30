/**
 * عرض حساب العميل مجمّعاً حسب الفاتورة — بلا توزيع تلقائي ولا تسوية تراكمية.
 *
 * كل فاتورة كتلة مستقلة تتبعها **حركاتها الحقيقية فقط**: الحركة تُنسب لفاتورة
 * إذا كانت تشير إليها صراحةً (`reference_id`) — لا استنتاج FIFO ولا تخمين عن
 * أي شحنة غُطّي منها. شحنات الرصيد غير المرتبطة بفاتورة تبقى في «الرصيد
 * القابل للتوزيع» ينقص من إجمالي حساب العميل، ويوزّعه المستخدم يدوياً.
 *
 * ## قاعدة الإشارة (نفس `netBalanceOf`)
 *   موجب  → «عليه» (مدين لنا)   — يُعرض بالأحمر بإشارة −
 *   سالب  → «له»   (دائن له)    — يُعرض بالأخضر بإشارة +
 *
 * ## الأثر على الحساب (`effect`)
 *   إنشاء فاتورة            → +الإجمالي
 *   دفعة نقدية/بنكية        → −المبلغ
 *   فائض دفعة (رصيد دائن)   → −المبلغ
 *   شحن رصيد                → −المبلغ
 *   سداد فاتورة من الرصيد   → 0 (المديونية والرصيد ينقصان معاً)
 *
 * ## الثابت المحفوظ
 *   إجمالي حساب العميل = Σ(متبقي الفواتير بإشارته) − الرصيد القابل للتوزيع
 *                      = `net_balance` المحسوب من القاعدة.
 * وهو أيضاً ناتج تراكم `effect` على كامل السلسلة.
 */
import { extractOperationNo } from "@/utils/buildCustomerLedger";
import { classifyCreditRow } from "@/utils/creditSource";

export type AccountEntryKind =
  | "invoice"
  | "payment"
  | "credit_settle"
  | "overpay"
  | "credit_charge"
  | "adjust";

export interface AccountEntry {
  id: string;
  kind: AccountEntryKind;
  /** طابع زمني كامل للترتيب والعرض بدقة الساعة */
  at: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM أو "" إن لم يُسجَّل وقت */
  time: string;
  /** اسم اليوم بالعربية */
  dayName: string;
  label: string;
  /** الحساب/الطريقة/رقم العملية */
  detail: string;
  /** أثر العملية على حساب العميل — موجب يزيد ما عليه، سالب يزيد ما له */
  effect: number;
  /** رصيد حساب العميل بعد هذه العملية */
  runningBalance: number;
  raw?: any;
}

export interface InvoiceBlock {
  invoiceId: string;
  invoiceNumber: string;
  at: string;
  date: string;
  time: string;
  dayName: string;
  total: number;
  /** المدفوع على الفاتورة (نقداً + ما طُبِّق من الرصيد) */
  paid: number;
  /**
   * المتبقي بإشارته: موجب «عليه»، سالب «له» (دفع أكثر من قيمتها).
   * يشمل الفائض المرتبط بهذه الفاتورة تحديداً.
   */
  remaining: number;
  /** الفائض المرتبط بهذه الفاتورة (يُستثنى من الرصيد القابل للتوزيع) */
  linkedOverpay: number;
  movements: AccountEntry[];
  /** رصيد حساب العميل لحظة إنشاء الفاتورة (قبل حركاتها) — يُعرض على سطرها */
  runningAtCreation: number;
  /** رصيد حساب العميل بعد آخر حركة في هذه الكتلة */
  runningAfter: number;
}

export interface CustomerAccountView {
  blocks: InvoiceBlock[];
  /** شحنات الرصيد غير المرتبطة بفاتورة — قابلة للتوزيع يدوياً */
  creditPool: AccountEntry[];
  creditPoolTotal: number;
  totalInvoiced: number;
  totalPaid: number;
  /** Σ متبقي الفواتير بإشارته */
  totalRemaining: number;
  /** إجمالي حساب العميل = totalRemaining − creditPoolTotal */
  accountTotal: number;
  /** فرق عن `net_balance` المخزَّن — يجب أن يكون 0 */
  drift: number;
}

const num = (v: any) => Number(v || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدًا",
  bank: "تحويل بنكي",
  bank_transfer: "تحويل بنكي",
  card: "بطاقة",
  mobile: "محفظة",
  credit_balance: "رصيد العميل",
};

/** تفكيك طابع زمني إلى تاريخ + وقت + اسم يوم. */
export function stampOf(row: { date?: any; created_at?: any }): {
  at: string; date: string; time: string; dayName: string;
} {
  const created = row.created_at ? String(row.created_at) : "";
  const plainDate = row.date ? String(row.date).slice(0, 10) : created.slice(0, 10);
  // الوقت يأتي من created_at وحده؛ عمود date تاريخ بلا وقت.
  const d = created ? new Date(created) : plainDate ? new Date(`${plainDate}T00:00:00`) : null;
  const valid = d && !Number.isNaN(d.getTime());
  const hasTime = !!created && valid;
  return {
    at: valid ? d!.toISOString() : plainDate,
    date: plainDate || (valid ? d!.toISOString().slice(0, 10) : ""),
    time: hasTime
      ? `${String(d!.getHours()).padStart(2, "0")}:${String(d!.getMinutes()).padStart(2, "0")}`
      : "",
    dayName: valid ? DAY_NAMES[d!.getDay()] : "",
  };
}

function accountOf(t: any, map?: Map<string, string>): string {
  if (t.method === "credit_balance") return "رصيد العميل";
  if (!t.account_id) return METHOD_LABEL[t.method] || "نقدًا";
  return map?.get(t.account_id) || METHOD_LABEL[t.method] || "—";
}

export interface BuildAccountViewInput {
  invoices?: any[];
  transactions?: any[];
  accountNameById?: Map<string, string>;
  /** `net_balance` المخزَّن — للتحقّق من عدم الانحراف */
  netBalance?: number | null;
}

export function buildCustomerAccountView(input: BuildAccountViewInput): CustomerAccountView {
  const { invoices = [], transactions = [], accountNameById, netBalance } = input;

  const liveInvoices = invoices.filter((i) => i.status !== "cancelled");
  const invoiceIds = new Set(liveInvoices.map((i) => String(i.id)));

  // ===== 1) دمج (استهلاك رصيد + دفعة بطريقة credit_balance) في حركة واحدة =====
  // الصفّان متلازمان وأثرهما على الحساب صفر — عرضهما منفصلين يضاعف الأرقام.
  const consumptions = transactions.filter(
    (t) => t.category === "customer_credit" && num(t.amount) < 0,
  );
  const creditPayments = transactions.filter(
    (t) => t.category === "customer_payment" && t.method === "credit_balance",
  );
  const mergedPaymentIds = new Set<string>();
  for (const c of consumptions) {
    const amt = Math.abs(num(c.amount));
    const match = creditPayments.find(
      (p) =>
        !mergedPaymentIds.has(p.id) &&
        Math.abs(num(p.amount) - amt) < 0.01 &&
        (!c.reference_id || !p.reference_id || c.reference_id === p.reference_id),
    );
    if (match) mergedPaymentIds.add(match.id);
  }

  // ===== 2) بناء الحركات =====
  const byInvoice = new Map<string, AccountEntry[]>();
  const pool: AccountEntry[] = [];
  const linkedOverpayByInvoice = new Map<string, number>();

  const push = (invoiceId: string | null, entry: AccountEntry) => {
    if (invoiceId && invoiceIds.has(invoiceId)) {
      if (!byInvoice.has(invoiceId)) byInvoice.set(invoiceId, []);
      byInvoice.get(invoiceId)!.push(entry);
    } else {
      pool.push(entry);
    }
  };

  for (const t of transactions) {
    if (mergedPaymentIds.has(t.id)) continue; // عولجت مع قيد الاستهلاك
    const amt = num(t.amount);
    const st = stampOf(t);
    const acc = accountOf(t, accountNameById);
    const opNo = extractOperationNo(t.description);
    const detail = `${acc}${opNo ? ` — رقم العملية ${opNo}` : ""}`;
    const ref = t.reference_id ? String(t.reference_id) : null;

    // (أ) استهلاك رصيد مُطبَّق على فاتورة — أثره صفر
    if (t.category === "customer_credit" && amt < 0) {
      push(ref, {
        id: `settle:${t.id}`,
        kind: "credit_settle",
        ...st,
        label: "سداد من رصيد العميل",
        detail,
        effect: 0,
        runningBalance: 0,
        raw: t,
      });
      continue;
    }

    // (ب) شحن رصيد أو فائض دفعة
    if (t.category === "customer_credit" && amt > 0) {
      const info = classifyCreditRow(t);
      const isOverpay = info.source === "overpay_invoice";
      const entry: AccountEntry = {
        id: `credit:${t.id}`,
        kind: isOverpay ? "overpay" : "credit_charge",
        ...st,
        label: isOverpay ? "فائض دفعة → رصيد العميل" : "شحن رصيد للعميل",
        detail,
        effect: -r2(amt),
        runningBalance: 0,
        raw: t,
      };
      if (isOverpay && ref && invoiceIds.has(ref)) {
        linkedOverpayByInvoice.set(ref, r2((linkedOverpayByInvoice.get(ref) || 0) + amt));
        push(ref, entry);
      } else {
        pool.push(entry);
      }
      continue;
    }

    // (ج) دفعة نقدية/بنكية
    if (t.category === "customer_payment") {
      push(ref, {
        id: `pay:${t.id}`,
        kind: "payment",
        ...st,
        label: ref && invoiceIds.has(ref) ? "دفعة على الفاتورة" : "دفعة من العميل",
        detail,
        effect: -r2(Math.abs(amt)),
        runningBalance: 0,
        raw: t,
      });
      continue;
    }

    // (د) أي حركة أخرى
    push(ref, {
      id: `adj:${t.id}`,
      kind: "adjust",
      ...st,
      label: t.description || "حركة مالية",
      detail,
      effect: amt < 0 ? r2(Math.abs(amt)) : -r2(amt),
      runningBalance: 0,
      raw: t,
    });
  }

  // ===== 3) كتل الفواتير مرتّبة زمنياً =====
  const blocks: InvoiceBlock[] = liveInvoices
    .map((inv) => {
      const st = stampOf(inv);
      const total = r2(num(inv.total));
      const paid = r2(num(inv.paid_amount));
      const overpay = r2(linkedOverpayByInvoice.get(String(inv.id)) || 0);
      const movements = (byInvoice.get(String(inv.id)) || []).sort((a, b) =>
        a.at.localeCompare(b.at),
      );
      return {
        invoiceId: String(inv.id),
        invoiceNumber: inv.invoice_number || "—",
        ...st,
        total,
        paid,
        // موجب «عليه»، سالب «له» — الفائض المرتبط بها يجعلها سالبة
        remaining: r2(total - paid - overpay),
        linkedOverpay: overpay,
        movements,
        runningAtCreation: 0,
        runningAfter: 0,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  const poolSorted = pool.sort((a, b) => a.at.localeCompare(b.at));

  // ===== 4) الرصيد الجاري بترتيب العرض — ينتهي عند إجمالي حساب العميل =====
  let running = 0;
  for (const b of blocks) {
    running = r2(running + b.total);
    b.runningAtCreation = running;
    for (const m of b.movements) {
      running = r2(running + m.effect);
      m.runningBalance = running;
    }
    b.runningAfter = running;
  }
  for (const e of poolSorted) {
    running = r2(running + e.effect);
    e.runningBalance = running;
  }

  const totalInvoiced = r2(blocks.reduce((s, b) => s + b.total, 0));
  const totalPaid = r2(blocks.reduce((s, b) => s + b.paid, 0));
  const totalRemaining = r2(blocks.reduce((s, b) => s + b.remaining, 0));

  // الرصيد القابل للتوزيع = صافي الرصيد الدائن (`credit_balance`): مجموع كل
  // قيود customer_credit — الشحنات موجبة وما استُهلك منها سالب — ناقص الفائض
  // المنسوب لفاتورة بعينها لأنه محسوب أصلاً ضمن متبقّيها السالب.
  const totalLinkedOverpay = r2(
    [...linkedOverpayByInvoice.values()].reduce((s, v) => s + v, 0),
  );
  const netCredit = r2(
    transactions
      .filter((t) => t.category === "customer_credit")
      .reduce((s, t) => s + num(t.amount), 0),
  );
  const creditPoolTotal = r2(netCredit - totalLinkedOverpay);
  const accountTotal = r2(totalRemaining - creditPoolTotal);

  return {
    blocks,
    creditPool: poolSorted,
    creditPoolTotal,
    totalInvoiced,
    totalPaid,
    totalRemaining,
    accountTotal,
    drift:
      netBalance != null && !Number.isNaN(Number(netBalance))
        ? r2(accountTotal - Number(netBalance))
        : 0,
  };
}

/**
 * نص أثر الحركة — دلتا موقّعة لا رصيد.
 * سالب يُنقص ما على العميل ⇒ «−X» أخضر؛ موجب يزيده ⇒ «+X» أحمر.
 * لا تُستعمل هنا لغة «له/عليه» لأنها تصف رصيداً لا حركة.
 */
export function effectText(effect: number): { text: string; tone: "debit" | "credit" | "settled" } {
  const n = r2(effect);
  if (Math.abs(n) < 0.01) return { text: "لا أثر", tone: "settled" };
  if (n < 0) return { text: `−${Math.abs(n).toLocaleString()}`, tone: "credit" };
  return { text: `+${n.toLocaleString()}`, tone: "debit" };
}

/** نص الرصيد بإشارته: «له +X» أخضر، «عليه −X» أحمر، «خالص» محايد. */
export function signedBalanceText(net: number): { text: string; tone: "debit" | "credit" | "settled" } {
  if (Math.abs(net) < 0.01) return { text: "خالص", tone: "settled" };
  if (net > 0) return { text: `عليه −${Math.abs(net).toLocaleString()}`, tone: "debit" };
  return { text: `له +${Math.abs(net).toLocaleString()}`, tone: "credit" };
}
