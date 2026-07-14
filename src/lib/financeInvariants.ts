/**
 * Finance Invariants — قواعد ثابتة لفحص اتساق الحسابات (قراءة فقط)
 *
 * لا تعدّل أي بيانات هنا. كل قاعدة تُرجع Pass/Fail + عيّنات من الصفوف المخالفة.
 * مصدر الحقيقة هو دوال DB: recompute_account_balance / recompute_customer_balance /
 * recompute_supplier_balance. أي انحراف بين المعروض والمحسوب = خلل.
 *
 * تُستخدم من:
 *  - لوحة Finance Health الإدارية (الدفعة 2)
 *  - اختبارات التكامل (الدفعة 3)
 *  - DevTools يدوياً: `import('@/lib/financeInvariants').then(m => m.runAllInvariants().then(console.table))`
 */
import { supabase } from "@/integrations/supabase/client";

export type InvariantSeverity = "critical" | "high" | "medium" | "low";

export type InvariantResult = {
  id: string;
  title: string;
  category: "accounts" | "customers" | "suppliers" | "invoices" | "transactions" | "pos" | "integrity";
  severity: InvariantSeverity;
  pass: boolean;
  /** ملخص عددي مختصر */
  summary: string;
  /** أول 10 صفوف مخالفة كدليل */
  offenders: Array<Record<string, any>>;
  /** تلميح للإصلاح */
  fixHint?: string;
  /** ملي ثانية تنفيذ */
  ms: number;
};

const EPS = 0.01;

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t = performance.now();
  const v = await fn();
  return { v, ms: Math.round(performance.now() - t) };
}

function pick<T extends Record<string, any>>(rows: T[], keys: (keyof T)[], limit = 10): Array<Record<string, any>> {
  return rows.slice(0, limit).map(r => {
    const o: Record<string, any> = {};
    keys.forEach(k => { o[k as string] = r[k]; });
    return o;
  });
}

// -----------------------------------------------------------------------------
// 1) رصيد الحساب = مجموع (إيراد − مصروف + تحويل داخل − تحويل خارج)
// -----------------------------------------------------------------------------
async function checkAccountBalances(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const [{ data: accs }, { data: txs }] = await Promise.all([
      supabase.from("accounts").select("id,name,balance"),
      supabase.from("transactions").select("type,amount,account_id,to_account_id"),
    ]);
    const computed = new Map<string, number>();
    (accs || []).forEach((a: any) => computed.set(a.id, 0));
    (txs || []).forEach((t: any) => {
      const amt = Number(t.amount || 0);
      if (t.type === "income" && t.account_id) computed.set(t.account_id, (computed.get(t.account_id) || 0) + amt);
      else if (t.type === "expense" && t.account_id) computed.set(t.account_id, (computed.get(t.account_id) || 0) - amt);
      else if (t.type === "transfer") {
        if (t.to_account_id) computed.set(t.to_account_id, (computed.get(t.to_account_id) || 0) + amt);
        if (t.account_id) computed.set(t.account_id, (computed.get(t.account_id) || 0) - amt);
      }
    });
    const offenders = (accs || [])
      .map((a: any) => ({ id: a.id, name: a.name, stored: Number(a.balance || 0), computed: computed.get(a.id) || 0 }))
      .filter(r => Math.abs(r.stored - r.computed) > EPS)
      .map(r => ({ ...r, delta: +(r.stored - r.computed).toFixed(2) }));
    return offenders;
  });
  return {
    id: "acc_balance_match",
    title: "رصيد كل حساب يطابق مجموع معاملاته",
    category: "accounts",
    severity: "critical",
    pass: v.length === 0,
    summary: v.length === 0 ? "جميع الحسابات متسقة" : `${v.length} حساب/حسابات خارج التوازن`,
    offenders: pick(v, ["name", "stored", "computed", "delta"]),
    fixHint: "استدع recompute_account_balance لكل حساب مخالف، أو راجع معاملة أُدخلت يدوياً بدون trigger.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 2) رصيد العميل = مجموع (إجمالي − مدفوع) للفواتير غير الملغاة وغير الكاش
// -----------------------------------------------------------------------------
async function checkCustomerBalances(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const [{ data: custs }, { data: invs }] = await Promise.all([
      supabase.from("customers").select("id,name,balance"),
      supabase.from("invoices").select("customer_id,total,paid_amount,status,source"),
    ]);
    const computed = new Map<string, number>();
    (custs || []).forEach((c: any) => computed.set(c.id, 0));
    (invs || []).forEach((i: any) => {
      if (!i.customer_id) return;
      if ((i.status || "") === "cancelled") return;
      if ((i.source || "") === "pos") return;
      const rem = Math.max(Number(i.total || 0) - Number(i.paid_amount || 0), 0);
      computed.set(i.customer_id, (computed.get(i.customer_id) || 0) + rem);
    });
    return (custs || [])
      .map((c: any) => ({ id: c.id, name: c.name, stored: Number(c.balance || 0), computed: +(computed.get(c.id) || 0).toFixed(2) }))
      .filter(r => Math.abs(r.stored - r.computed) > EPS)
      .map(r => ({ ...r, delta: +(r.stored - r.computed).toFixed(2) }));
  });
  return {
    id: "cust_balance_match",
    title: "رصيد العميل = مجموع المتبقي من فواتيره غير الملغاة (بدون كاش)",
    category: "customers",
    severity: "critical",
    pass: v.length === 0,
    summary: v.length === 0 ? "جميع العملاء متسقون" : `${v.length} عميل/عملاء خارج التوازن`,
    offenders: pick(v, ["name", "stored", "computed", "delta"]),
    fixHint: "شغّل RPC recalc_all_customer_balances من صفحة تقرير المديونية.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 3) رصيد المورد = مجموع (إجمالي − مدفوع) لأوامر الشراء غير الملغاة
// -----------------------------------------------------------------------------
async function checkSupplierBalances(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const [{ data: sups }, { data: pos }, { data: txs }] = await Promise.all([
      supabase.from("suppliers").select("id,name,balance"),
      supabase.from("purchase_orders").select("supplier_id,total,paid_amount,status"),
      supabase.from("transactions").select("supplier_id,amount,category,reference_id"),
    ]);
    const open = new Map<string, number>();
    (sups || []).forEach((s: any) => open.set(s.id, 0));
    (pos || []).forEach((p: any) => {
      if (!p.supplier_id) return;
      if ((p.status || "") === "cancelled") return;
      const rem = Math.max(Number(p.total || 0) - Number(p.paid_amount || 0), 0);
      open.set(p.supplier_id, (open.get(p.supplier_id) || 0) + rem);
    });
    const unlinked = new Map<string, number>();
    (txs || []).forEach((t: any) => {
      if (t.category !== "supplier_payment" || !t.supplier_id || t.reference_id) return;
      unlinked.set(t.supplier_id, (unlinked.get(t.supplier_id) || 0) + Number(t.amount || 0));
    });
    return (sups || [])
      .map((s: any) => {
        const computed = Math.max((open.get(s.id) || 0) - (unlinked.get(s.id) || 0), 0);
        return { id: s.id, name: s.name, stored: Number(s.balance || 0), computed: +computed.toFixed(2) };
      })
      .filter(r => Math.abs(r.stored - r.computed) > EPS)
      .map(r => ({ ...r, delta: +(r.stored - r.computed).toFixed(2) }));
  });
  return {
    id: "supp_balance_match",
    title: "رصيد المورد = المتبقي من أوامر الشراء ناقص الدفعات غير المرتبطة",
    category: "suppliers",
    severity: "high",
    pass: v.length === 0,
    summary: v.length === 0 ? "جميع الموردين متسقون" : `${v.length} مورد/موردين خارج التوازن`,
    offenders: pick(v, ["name", "stored", "computed", "delta"]),
    fixHint: "استدع recompute_supplier_balance لكل مورد مخالف.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 4) لا فاتورة مدفوع فيها > الإجمالي
// -----------------------------------------------------------------------------
async function checkNoOverpaidInvoices(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const { data } = await supabase
      .from("invoices").select("id,invoice_number,total,paid_amount,customer_id")
      .order("created_at", { ascending: false });
    return (data || [])
      .filter((i: any) => Number(i.paid_amount || 0) > Number(i.total || 0) + EPS)
      .map((i: any) => ({
        invoice_number: i.invoice_number,
        total: Number(i.total || 0),
        paid_amount: Number(i.paid_amount || 0),
        over_by: +(Number(i.paid_amount) - Number(i.total)).toFixed(2),
      }));
  });
  return {
    id: "no_overpaid",
    title: "لا فاتورة مدفوع فيها أكثر من الإجمالي",
    category: "invoices",
    severity: "critical",
    pass: v.length === 0,
    summary: v.length === 0 ? "لا يوجد Overpaid" : `${v.length} فاتورة مدفوع فيها أكثر`,
    offenders: pick(v, ["invoice_number", "total", "paid_amount", "over_by"]),
    fixHint: "الفائض يجب تحويله إلى customer_credit؛ راجع دفعات هذه الفواتير.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 5) لا مبالغ سالبة في المعاملات
// -----------------------------------------------------------------------------
async function checkNoNegativeTx(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const { data } = await supabase
      .from("transactions").select("id,date,type,amount,description").lt("amount", 0);
    return (data || []).map((t: any) => ({ date: t.date, type: t.type, amount: t.amount, description: t.description }));
  });
  return {
    id: "no_negative_tx",
    title: "لا مبالغ سالبة في المعاملات",
    category: "transactions",
    severity: "high",
    pass: v.length === 0,
    summary: v.length === 0 ? "OK" : `${v.length} معاملة بمبلغ سالب`,
    offenders: v.slice(0, 10),
    fixHint: "الإشارة تُحدد من النوع (income/expense) لا من إشارة المبلغ.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 6) كل تحويل له to_account_id مختلف عن account_id
// -----------------------------------------------------------------------------
async function checkTransferIntegrity(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const { data } = await supabase
      .from("transactions").select("id,date,amount,account_id,to_account_id,description")
      .eq("type", "transfer");
    return (data || []).filter((t: any) =>
      !t.account_id || !t.to_account_id || t.account_id === t.to_account_id,
    ).map((t: any) => ({
      date: t.date, amount: t.amount,
      from: t.account_id, to: t.to_account_id,
      problem: !t.to_account_id ? "بدون طرف مستلم" : !t.account_id ? "بدون طرف مُرسل" : "المُرسل = المستلم",
    }));
  });
  return {
    id: "transfer_integrity",
    title: "كل تحويل مالي بين حسابين مختلفين ومحدّدين",
    category: "transactions",
    severity: "critical",
    pass: v.length === 0,
    summary: v.length === 0 ? "OK" : `${v.length} تحويل معطوب`,
    offenders: v.slice(0, 10),
    ms,
  };
}

// -----------------------------------------------------------------------------
// 7) عزل POS: لا معاملة customer_payment مربوطة بفاتورة كاش تُدخل في رصيد عميل
// -----------------------------------------------------------------------------
async function checkPosIsolation(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const { data: posInvs } = await supabase.from("invoices").select("id,invoice_number").eq("source", "pos");
    const posIds = new Set((posInvs || []).map((r: any) => r.id));
    if (posIds.size === 0) return [] as any[];
    const { data: txs } = await supabase
      .from("transactions").select("id,date,amount,customer_id,reference_id,category")
      .eq("category", "customer_payment").not("customer_id", "is", null);
    return (txs || [])
      .filter((t: any) => t.reference_id && posIds.has(t.reference_id))
      .map((t: any) => ({ date: t.date, amount: t.amount, customer_id: t.customer_id, invoice_id: t.reference_id }));
  });
  return {
    id: "pos_isolation",
    title: "دفعات فواتير الكاش لا تُنسب إلى بطاقات العملاء",
    category: "pos",
    severity: "high",
    pass: v.length === 0,
    summary: v.length === 0 ? "العزل سليم" : `${v.length} معاملة كاش مربوطة بعميل`,
    offenders: v.slice(0, 10),
    fixHint: "فواتير POS يجب أن تكون بلا customer_id أو تُستثنى من كشف العميل.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 8) اتساق حالة الفاتورة مع paid/total
// -----------------------------------------------------------------------------
async function checkInvoiceStatusConsistency(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const { data } = await supabase
      .from("invoices").select("id,invoice_number,total,paid_amount,status,due_date");
    return (data || []).filter((i: any) => {
      if (i.status === "cancelled") return false;
      const t = Number(i.total || 0), p = Number(i.paid_amount || 0);
      const expected =
        t > 0 && p >= t - EPS ? "paid" :
        p > EPS ? "partial" :
        (i.due_date && new Date(i.due_date) < new Date() && t - p > EPS) ? "overdue" :
        "pending";
      return expected !== i.status;
    }).map((i: any) => ({
      invoice_number: i.invoice_number, total: i.total, paid_amount: i.paid_amount,
      status: i.status,
    }));
  });
  return {
    id: "invoice_status_consistency",
    title: "حالة الفاتورة (paid/partial/pending/overdue) تطابق المبالغ",
    category: "invoices",
    severity: "medium",
    pass: v.length === 0,
    summary: v.length === 0 ? "OK" : `${v.length} فاتورة بحالة غير متطابقة`,
    offenders: v.slice(0, 10),
    fixHint: "UPDATE على الفاتورة يعيد تشغيل trg_invoice_recompute_status.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 9) لا بنود يتيمة (invoice_items بلا فاتورة موجودة)
// -----------------------------------------------------------------------------
async function checkOrphanInvoiceItems(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const [{ data: invs }, { data: items }] = await Promise.all([
      supabase.from("invoices").select("id"),
      supabase.from("invoice_items").select("id,invoice_id,product_id,quantity"),
    ]);
    const ids = new Set((invs || []).map((r: any) => r.id));
    return (items || []).filter((it: any) => !ids.has(it.invoice_id));
  });
  return {
    id: "no_orphan_invoice_items",
    title: "لا بنود فاتورة يتيمة",
    category: "integrity",
    severity: "medium",
    pass: v.length === 0,
    summary: v.length === 0 ? "OK" : `${v.length} بند يتيم`,
    offenders: v.slice(0, 10),
    ms,
  };
}

// -----------------------------------------------------------------------------
// 10) رصيد الائتمان (credit_balance) للعميل = مجموع customer_credit
// -----------------------------------------------------------------------------
async function checkCustomerCreditBalance(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const [{ data: custs }, { data: txs }] = await Promise.all([
      supabase.from("customers").select("id,name,credit_balance"),
      supabase.from("transactions").select("customer_id,amount,category").eq("category", "customer_credit"),
    ]);
    const sum = new Map<string, number>();
    (txs || []).forEach((t: any) => {
      if (!t.customer_id) return;
      sum.set(t.customer_id, (sum.get(t.customer_id) || 0) + Number(t.amount || 0));
    });
    return (custs || [])
      .map((c: any) => ({ id: c.id, name: c.name, stored: Number(c.credit_balance || 0), computed: +(sum.get(c.id) || 0).toFixed(2) }))
      .filter(r => Math.abs(r.stored - r.computed) > EPS)
      .map(r => ({ ...r, delta: +(r.stored - r.computed).toFixed(2) }));
  });
  return {
    id: "cust_credit_balance_match",
    title: "الرصيد الدائن للعميل = مجموع customer_credit",
    category: "customers",
    severity: "high",
    pass: v.length === 0,
    summary: v.length === 0 ? "OK" : `${v.length} عميل بائتمان غير متطابق`,
    offenders: pick(v, ["name", "stored", "computed", "delta"]),
    fixHint: "شغّل recompute_customer_balance للعميل.",
    ms,
  };
}

// -----------------------------------------------------------------------------
// 11) كل معاملة بنكية لها account_id
// -----------------------------------------------------------------------------
async function checkBankTxHasAccount(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const { data } = await supabase
      .from("transactions").select("id,date,amount,method,account_id,description")
      .eq("method", "bank").is("account_id", null);
    return (data || []).slice(0, 10);
  });
  return {
    id: "bank_tx_has_account",
    title: "كل معاملة بطريقة تحويل بنكي لها حساب محدد",
    category: "transactions",
    severity: "high",
    pass: v.length === 0,
    summary: v.length === 0 ? "OK" : `${v.length} معاملة بنكية بدون حساب`,
    offenders: v,
    ms,
  };
}

// -----------------------------------------------------------------------------
// 12) عروض السعر المتحوّلة → الفاتورة الهدف موجودة
// -----------------------------------------------------------------------------
async function checkQuoteConversionIntegrity(): Promise<InvariantResult> {
  const { v, ms } = await timed(async () => {
    const [{ data: quotes }, { data: invs }] = await Promise.all([
      supabase.from("quotes").select("id,quote_number,status,converted_to_invoice_id"),
      supabase.from("invoices").select("id"),
    ]);
    const ids = new Set((invs || []).map((r: any) => r.id));
    return (quotes || [])
      .filter((q: any) => q.converted_to_invoice_id && !ids.has(q.converted_to_invoice_id))
      .map((q: any) => ({ quote_number: q.quote_number, status: q.status, missing_invoice: q.converted_to_invoice_id }));
  });
  return {
    id: "quote_conversion_integrity",
    title: "كل عرض سعر متحوّل مرتبط بفاتورة موجودة",
    category: "integrity",
    severity: "medium",
    pass: v.length === 0,
    summary: v.length === 0 ? "OK" : `${v.length} عرض سعر مرتبط بفاتورة محذوفة`,
    offenders: v.slice(0, 10),
    ms,
  };
}

// -----------------------------------------------------------------------------
// Runner
// -----------------------------------------------------------------------------
export const INVARIANTS = [
  checkAccountBalances,
  checkCustomerBalances,
  checkSupplierBalances,
  checkCustomerCreditBalance,
  checkNoOverpaidInvoices,
  checkInvoiceStatusConsistency,
  checkNoNegativeTx,
  checkTransferIntegrity,
  checkBankTxHasAccount,
  checkPosIsolation,
  checkOrphanInvoiceItems,
  checkQuoteConversionIntegrity,
] as const;

export type FinanceHealthReport = {
  ranAt: string;
  totalMs: number;
  pass: number;
  fail: number;
  results: InvariantResult[];
};

/** يشغّل كل القواعد بالتوازي ويُرجع تقريراً مرتّباً. */
export async function runAllInvariants(): Promise<FinanceHealthReport> {
  const t = performance.now();
  const results = await Promise.all(INVARIANTS.map(fn => fn().catch(err => ({
    id: fn.name, title: fn.name, category: "integrity" as const, severity: "critical" as const,
    pass: false, summary: `خطأ: ${err?.message || err}`, offenders: [], ms: 0,
  }))));
  // Sort: failing critical first
  const sevOrder: Record<InvariantSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  results.sort((a, b) => Number(a.pass) - Number(b.pass) || sevOrder[a.severity] - sevOrder[b.severity]);
  return {
    ranAt: new Date().toISOString(),
    totalMs: Math.round(performance.now() - t),
    pass: results.filter(r => r.pass).length,
    fail: results.filter(r => !r.pass).length,
    results,
  };
}
