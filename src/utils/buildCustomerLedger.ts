/**
 * دفتر أستاذ العميل — سجل حركات موحّد بالتسلسل الزمني.
 *
 * يدمج مصدرين فقط (بدون أي كتابة/تعديل على قاعدة البيانات):
 *   - `invoices`     → قيد مدين بقيمة إجمالي الفاتورة عند إنشائها
 *   - `transactions` → قيود دائنة/مدينة (دفعات، شحن رصيد، استهلاك رصيد، فائض)
 *
 * قاعدة الإشارة (نفس منطق netBalanceOf):
 *   الرصيد الجاري = Σ(مدين) − Σ(دائن)
 *   موجب  → «عليه» (مدين لنا)
 *   سالب  → «له»   (رصيد دائن لصالحه)
 *
 * منع الازدواج: الدفعة الزائدة مقسومة أصلاً في `splitPayment` إلى
 * `customer_payment` (المطبَّق على الفاتورة) + `customer_credit` (الفائض)،
 * لذلك جمع الاثنين لا يُكرِّر أي مبلغ.
 *
 * سداد فاتورة من رصيد دائن يُنتج صفّين متلازمين:
 *   customer_credit سالب (خصم من الرصيد) + customer_payment بطريقة credit_balance.
 * نَدمجهما في صف واحد «سداد فاتورة … من شحن رصيد …» فيظهر مدين ودائن بنفس القيمة
 * وأثره على الرصيد صفر — وهو السلوك المحاسبي الصحيح.
 */
import { classifyCreditRow } from "@/utils/creditSource";
import { paymentStatement, indexLinkedOverpay } from "@/utils/paymentDisplay";

export type LedgerKind =
  | "invoice"
  | "payment"
  | "charge"
  | "credit_used"
  | "overpay"
  | "adjust"
  | "deleted_invoice";

export interface LedgerEvent {
  id: string;
  /** تاريخ الحدث YYYY-MM-DD */
  date: string;
  /** مفتاح ترتيب دقيق (تاريخ + وقت الإنشاء + أولوية النوع) */
  sortKey: string;
  kind: LedgerKind;
  /** رقم الفاتورة أو مرجع العملية */
  refNumber: string;
  refKind: "invoice" | "charge" | "payment" | "none";
  /** معرّف الفاتورة المرتبطة (للانتقال) */
  invoiceId?: string | null;
  /** البيان الأساسي */
  statement: string;
  /** السبب/المصدر (من أين نُفِّذت العملية) */
  reason: string;
  /** الحساب المستلم / طريقة الدفع */
  accountLabel: string;
  /** رقم العملية إن وُجد */
  operationNo?: string | null;
  debit: number;
  credit: number;
  /** الرصيد الجاري بعد هذا الصف */
  balance: number;
  /** صف لا يُحتسب في المجاميع (فاتورة محذوفة/ملغاة) */
  excluded?: boolean;
  /** هل هو صف تابع (دفعة تحت فاتورة) — لعرض «↳» */
  child?: boolean;
  /** الصف الخام للرجوع إليه في الواجهة */
  raw?: any;
}

export interface LedgerResult {
  events: LedgerEvent[];
  totalDebit: number;
  totalCredit: number;
  /** الرصيد الختامي المحسوب من السجل */
  closing: number;
}

export interface BuildLedgerInput {
  invoices?: any[];
  transactions?: any[];
  deletedInvoices?: any[];
  /** اسم الحساب/البنك حسب المعرّف */
  accountNameById?: Map<string, string>;
  /** إدراج الفواتير المحذوفة كصفوف رمادية غير محتسبة */
  includeDeleted?: boolean;
}

const KIND_ORDER: Record<LedgerKind, number> = {
  invoice: 0,
  deleted_invoice: 0,
  charge: 1,
  payment: 2,
  credit_used: 3,
  overpay: 4,
  adjust: 5,
};

const num = (v: any) => Number(v || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** استخراج رقم العملية من الوصف (متوافق مع الصيغ القديمة: مرجع/إشعار) */
export function extractOperationNo(desc?: string | null): string | null {
  if (!desc) return null;
  const m = String(desc).match(/(?:رقم\s*العملية|مرجع|إشعار|ref)\s*[:#]?\s*([A-Za-z0-9\-_/]+)/i);
  return m ? m[1] : null;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدًا",
  bank: "تحويل بنكي",
  card: "بطاقة",
  mobile: "محفظة",
  credit_balance: "رصيد دائن",
};

function accountOf(t: any, map?: Map<string, string>): string {
  if (t.method === "credit_balance") return "رصيد دائن";
  if (!t.account_id) return METHOD_LABEL[t.method] || "نقدًا";
  return map?.get(t.account_id) || METHOD_LABEL[t.method] || "—";
}

export function buildCustomerLedger(input: BuildLedgerInput): LedgerResult {
  const {
    invoices = [],
    transactions = [],
    deletedInvoices = [],
    accountNameById,
    includeDeleted = true,
  } = input;

  const invoiceById = new Map<string, any>();
  for (const inv of invoices) invoiceById.set(inv.id, inv);
  // الفائض منسوباً إلى الدفعة التي أنتجته، مفهرساً قبل المرور — ترتيب
  // القاعدة لا يضمن وصول قيد الفائض قبل قيد دفعته.
  const overpayByPayment = indexLinkedOverpay(
    transactions,
    (t) => classifyCreditRow(t).source === "overpay_invoice",
  );

  const events: Omit<LedgerEvent, "balance">[] = [];

  // ===== 1) الفواتير =====
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    events.push({
      id: `inv:${inv.id}`,
      date: inv.date || String(inv.created_at || "").slice(0, 10),
      sortKey: `${inv.date || ""}|${inv.created_at || ""}|${KIND_ORDER.invoice}`,
      kind: "invoice",
      refNumber: inv.invoice_number || "—",
      refKind: "invoice",
      invoiceId: inv.id,
      statement: "إنشاء فاتورة",
      reason: inv.source === "quote" ? "تحويل من عرض سعر" : "شاشة إنشاء فاتورة",
      accountLabel: "—",
      operationNo: null,
      debit: r2(num(inv.total)),
      credit: 0,
      raw: inv,
    });
  }

  // ===== 2) المعاملات — مع دمج (استهلاك رصيد + دفعة من رصيد) =====
  const creditUsed = transactions.filter(
    (t) => t.category === "customer_credit" && num(t.amount) < 0,
  );
  const creditPayments = transactions.filter(
    (t) => t.category === "customer_payment" && t.method === "credit_balance",
  );
  const mergedPaymentIds = new Set<string>();

  for (const cu of creditUsed) {
    const amt = Math.abs(num(cu.amount));
    const match = creditPayments.find(
      (p) =>
        !mergedPaymentIds.has(p.id) &&
        Math.abs(num(p.amount) - amt) < 0.01 &&
        (!cu.reference_id || !p.reference_id || cu.reference_id === p.reference_id),
    );
    if (match) mergedPaymentIds.add(match.id);
    const invId = match?.reference_id || cu.reference_id || null;
    const inv = invId ? invoiceById.get(invId) : null;
    const info = classifyCreditRow(cu);
    const chargeRef = info.linkedInvoice || extractOperationNo(cu.description);
    events.push({
      id: `cu:${cu.id}`,
      date: cu.date || String(cu.created_at || "").slice(0, 10),
      sortKey: `${cu.date || ""}|${cu.created_at || ""}|${KIND_ORDER.credit_used}`,
      kind: "credit_used",
      refNumber: inv?.invoice_number || chargeRef || "—",
      refKind: inv ? "invoice" : "charge",
      invoiceId: inv?.id || null,
      statement: inv
        ? `سداد فاتورة ${inv.invoice_number} من رصيد دائن`
        : "استهلاك رصيد دائن",
      reason: chargeRef ? `خصم من شحن رصيد ${chargeRef}` : "سداد الفواتير من الرصيد الدائن",
      accountLabel: "رصيد دائن",
      operationNo: extractOperationNo(cu.description),
      debit: r2(amt),
      credit: match ? r2(num(match.amount)) : 0,
      child: !!inv,
      raw: cu,
    });
  }

  for (const t of transactions) {
    if (mergedPaymentIds.has(t.id)) continue;
    const amt = num(t.amount);
    const inv = t.reference_id ? invoiceById.get(t.reference_id) : null;
    const opNo = extractOperationNo(t.description);
    const acc = accountOf(t, accountNameById);

    if (t.category === "customer_payment") {
      events.push({
        id: `pay:${t.id}`,
        date: t.date || String(t.created_at || "").slice(0, 10),
        sortKey: `${t.date || ""}|${t.created_at || ""}|${KIND_ORDER.payment}`,
        kind: "payment",
        refNumber: inv?.invoice_number || t.reference_no || "—",
        refKind: inv ? "invoice" : "payment",
        invoiceId: inv?.id || null,
        // الدفعة كما دفعها العميل — لا كما قُسِّمت في الدفاتر. راجع
        // `paymentDisplay`: القيدان يبقيان، والمضموم نصٌّ لا مبلغٌ يُحتسب.
        statement: paymentStatement({
          applied: Math.abs(amt),
          surplus: overpayByPayment.get(String(t.id)) || 0,
          invoiceNumber: inv?.invoice_number || null,
          invoiceTotal: inv ? num(inv.total) : null,
        }),
        reason: `تسجيل دفعة — ${acc}${opNo ? ` (رقم العملية ${opNo})` : ""}`,
        accountLabel: acc,
        operationNo: opNo,
        debit: 0,
        credit: r2(Math.abs(amt)),
        child: !!inv,
        raw: t,
      });
      continue;
    }

    if (t.category === "customer_credit" && amt > 0) {
      const info = classifyCreditRow(t);
      const isOverpay = info.source === "overpay_invoice";
      events.push({
        id: `cr:${t.id}`,
        date: t.date || String(t.created_at || "").slice(0, 10),
        sortKey: `${t.date || ""}|${t.created_at || ""}|${isOverpay ? KIND_ORDER.overpay : KIND_ORDER.charge}`,
        kind: isOverpay ? "overpay" : "charge",
        refNumber: info.linkedInvoice || opNo || "—",
        refKind: isOverpay ? "invoice" : "charge",
        invoiceId: inv?.id || null,
        statement: isOverpay
          ? `فائض فاتورة ${info.linkedInvoice || ""} → رصيد دائن`.trim()
          : "شحن رصيد للعميل",
        reason: isOverpay
          ? "الفائض من دفعة أكبر من المتبقي"
          : `${info.label} — ${acc}${opNo ? ` (رقم العملية ${opNo})` : ""}`,
        accountLabel: acc,
        operationNo: opNo,
        debit: 0,
        credit: r2(amt),
        child: isOverpay,
        raw: t,
      });
      continue;
    }

    if (t.category === "customer_credit" && amt < 0) continue; // عولجت أعلاه

    // أي حركة أخرى مرتبطة بالعميل (تعديل/استرجاع…)
    events.push({
      id: `adj:${t.id}`,
      date: t.date || String(t.created_at || "").slice(0, 10),
      sortKey: `${t.date || ""}|${t.created_at || ""}|${KIND_ORDER.adjust}`,
      kind: "adjust",
      refNumber: inv?.invoice_number || opNo || "—",
      refKind: inv ? "invoice" : "none",
      invoiceId: inv?.id || null,
      statement: t.description || "حركة مالية",
      reason: acc,
      accountLabel: acc,
      operationNo: opNo,
      debit: amt < 0 ? r2(Math.abs(amt)) : 0,
      credit: amt > 0 ? r2(amt) : 0,
      raw: t,
    });
  }

  // ===== 3) الفواتير المحذوفة (غير محتسبة) =====
  if (includeDeleted) {
    for (const d of deletedInvoices) {
      events.push({
        id: `del:${d.invoice_id || d.invoice_number || Math.random()}`,
        date: d.date || String(d.deleted_at || "").slice(0, 10),
        sortKey: `${d.date || ""}|${d.deleted_at || ""}|${KIND_ORDER.deleted_invoice}`,
        kind: "deleted_invoice",
        refNumber: d.invoice_number || "—",
        refKind: "invoice",
        invoiceId: null,
        statement: `فاتورة محذوفة — ${num(d.total).toLocaleString()}`,
        reason: `حُذفت في ${d.deleted_at ? new Date(d.deleted_at).toLocaleString() : "—"}${d.user_email ? ` بواسطة ${d.user_email}` : ""} — لا تُحتسب`,
        accountLabel: "—",
        operationNo: null,
        debit: 0,
        credit: 0,
        excluded: true,
        raw: d,
      });
    }
  }

  // ===== 4) الترتيب الزمني + الرصيد الجاري =====
  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "en", { numeric: true }));

  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const withBalance: LedgerEvent[] = events.map((e) => {
    if (!e.excluded) {
      running = r2(running + e.debit - e.credit);
      totalDebit = r2(totalDebit + e.debit);
      totalCredit = r2(totalCredit + e.credit);
    }
    return { ...e, balance: running };
  });

  return { events: withBalance, totalDebit, totalCredit, closing: running };
}

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  invoice: "فاتورة",
  payment: "دفعة",
  charge: "شحن رصيد",
  credit_used: "سداد من رصيد",
  overpay: "فائض",
  adjust: "تعديل",
  deleted_invoice: "محذوفة",
};

/** أصناف تلوين الشارة — توكنات التصميم فقط */
export const LEDGER_KIND_CLASS: Record<LedgerKind, string> = {
  invoice: "bg-primary/10 text-primary border-primary/30",
  payment: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  charge: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  credit_used: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  overpay: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  adjust: "bg-muted text-muted-foreground border-border",
  deleted_invoice: "bg-destructive/10 text-destructive border-destructive/30",
};
