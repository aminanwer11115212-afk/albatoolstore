/**
 * منطق نقي لنافذة «سداد فواتير من رصيد العميل».
 *
 * مرآة TypeScript لمنطق RPC `settle_invoices_from_credit` كي تُختبر الحسابات
 * بمعزل عن React/Supabase. الثابت المحاسبي الحاكم:
 *   السداد من الرصيد لا يغيّر صافي حساب العميل — المديونية والرصيد الدائن
 *   ينقصان بنفس المبلغ، فيبقى net = balance - credit كما هو.
 */

export const SETTLE_EPS = 0.01;

export interface OpenInvoice {
  id: string;
  invoice_number: string | null;
  date: string;
  total: number;
  paid_amount: number;
  remaining: number;
}

export interface SettleItem {
  invoice_id: string;
  amount: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * توزيع تلقائي FIFO (الأقدم أولاً): يملأ المتبقي لكل فاتورة من الرصيد المتاح
 * حتى ينفد. يُرجع خريطة invoice_id → المبلغ المقترح (مقرّب لخانتين).
 */
export function autoAllocateFifo(invoices: OpenInvoice[], credit: number): Map<string, number> {
  const out = new Map<string, number>();
  let left = round2(Math.max(credit, 0));
  const sorted = [...invoices]
    .filter((i) => i.remaining > SETTLE_EPS)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  for (const inv of sorted) {
    if (left <= SETTLE_EPS) break;
    const apply = round2(Math.min(left, inv.remaining));
    if (apply <= SETTLE_EPS) continue;
    out.set(inv.id, apply);
    left = round2(left - apply);
  }
  return out;
}

// واجهة واحدة بحقول اختيارية (لا discriminated union): المشروع يعمل بـ strict:false
// حيث لا يعمل تضييق النوع بفحص v.ok — فنُبقي reason/total متاحين دائماً.
export interface SettleValidation {
  ok: boolean;
  /** موجود عند النجاح (المجموع) وقد يظهر مع exceeds_credit */
  total?: number;
  reason?: "empty" | "invalid_amount" | "unknown_invoice" | "exceeds_remaining" | "exceeds_credit";
  invoiceId?: string;
}

/** تحقق شامل قبل الإرسال — نفس قواعد الـ RPC. */
export function validateSettlement(
  items: SettleItem[],
  invoicesById: Map<string, OpenInvoice>,
  credit: number,
): SettleValidation {
  if (!items.length) return { ok: false, reason: "empty" };
  // تجميع التكرارات لنفس الفاتورة (نفس سلوك الـ RPC) قبل فحص المتبقي.
  const perInvoice = new Map<string, number>();
  for (const it of items) {
    if (!it.amount || it.amount <= 0 || !Number.isFinite(it.amount)) {
      return { ok: false, reason: "invalid_amount", invoiceId: it.invoice_id };
    }
    perInvoice.set(it.invoice_id, round2((perInvoice.get(it.invoice_id) || 0) + it.amount));
  }
  let total = 0;
  for (const [id, amount] of perInvoice) {
    const inv = invoicesById.get(id);
    if (!inv) return { ok: false, reason: "unknown_invoice", invoiceId: id };
    if (amount - inv.remaining > SETTLE_EPS) {
      return { ok: false, reason: "exceeds_remaining", invoiceId: id };
    }
    total = round2(total + amount);
  }
  if (total - credit > SETTLE_EPS) return { ok: false, reason: "exceeds_credit", total };
  return { ok: true, total };
}

export interface SettleSimulation {
  perInvoice: Array<{
    invoice_id: string;
    invoice_number: string | null;
    applied: number;
    paid_after: number;
    remaining_after: number;
    new_status: "paid" | "partial" | "pending";
  }>;
  appliedTotal: number;
  creditAfter: number;
  balanceAfter: number;
  netBefore: number;
  netAfter: number;
}

/**
 * محاكاة أثر السداد (نفس معادلات الـ RPC) لعرض «قبل/بعد» في النافذة
 * ولإثبات ثبات الصافي في الاختبارات.
 */
export function simulateSettlement(
  invoices: OpenInvoice[],
  items: SettleItem[],
  balance: number,
  credit: number,
): SettleSimulation {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const perInvoiceAmount = new Map<string, number>();
  for (const it of items) {
    perInvoiceAmount.set(it.invoice_id, round2((perInvoiceAmount.get(it.invoice_id) || 0) + it.amount));
  }
  const perInvoice: SettleSimulation["perInvoice"] = [];
  let appliedTotal = 0;
  for (const [id, requested] of perInvoiceAmount) {
    const inv = byId.get(id);
    if (!inv) continue;
    const applied = round2(Math.min(requested, Math.max(inv.remaining, 0)));
    if (applied <= SETTLE_EPS) continue;
    const paidAfter = round2(inv.paid_amount + applied);
    const remainingAfter = round2(Math.max(inv.total - paidAfter, 0));
    const newStatus: "paid" | "partial" | "pending" =
      inv.total > 0 && paidAfter >= inv.total - SETTLE_EPS ? "paid" : paidAfter > SETTLE_EPS ? "partial" : "pending";
    perInvoice.push({
      invoice_id: id,
      invoice_number: inv.invoice_number,
      applied,
      paid_after: paidAfter,
      remaining_after: remainingAfter,
      new_status: newStatus,
    });
    appliedTotal = round2(appliedTotal + applied);
  }
  // balance = Σ المتبقي للفواتير المفتوحة ⇒ ينقص بمقدار المطبَّق؛ والرصيد كذلك.
  const balanceAfter = round2(balance - appliedTotal);
  const creditAfter = round2(credit - appliedTotal);
  return {
    perInvoice,
    appliedTotal,
    creditAfter,
    balanceAfter,
    netBefore: round2(balance - credit),
    netAfter: round2(balanceAfter - creditAfter),
  };
}
