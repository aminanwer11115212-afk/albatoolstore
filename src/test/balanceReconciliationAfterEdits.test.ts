/**
 * دقة الحسابات — الرصيد المعروض يطابق `net_balance` المحسوب من القاعدة بعد كل
 * تعديل/حذف، في سيناريوهات متعددة الفواتير والشحنات.
 *
 * تُحاكى العمليات بنفس ما تفعله الـRPCs فعلاً:
 *   • حذف دفعة مرتبطة بفاتورة → `paid_amount -= amount` ثم حذف صف الحركة.
 *   • تعديل دفعة            → `paid_amount += (جديد − قديم)` وتحديث الصف.
 *   • حذف شحن رصيد          → حذف صف `customer_credit` فقط.
 * ثم يُقارَن الصافي المعروض (buildCustomerAccountView) بالصافي المحسوب من
 * الصفوف بقاعدة `recompute_customer_balance`.
 */
import { describe, it, expect } from "vitest";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";
import { buildCustomerLedger } from "@/utils/buildCustomerLedger";
import { creditChargeDeletability, projectDeleteImpact, projectEditImpact } from "@/utils/ledgerEntryActions";

type Inv = { id: string; invoice_number: string; date: string; total: number; paid_amount: number; status?: string };
type Tx = any;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** نفس قاعدة recompute_customer_balance: مديونية غير سالبة لكل فاتورة − الرصيد الدائن. */
function netBalance(invoices: Inv[], txs: Tx[]): number {
  const debt = invoices
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + Math.max(r2(i.total) - r2(i.paid_amount), 0), 0);
  const credit = txs
    .filter((t) => t.category === "customer_credit")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return r2(debt - credit);
}

/** الصافي كما يعرضه الكشف المجمّع. */
function displayedNet(invoices: Inv[], txs: Tx[]): number {
  return buildCustomerAccountView({ invoices, transactions: txs, netBalance: netBalance(invoices, txs) }).accountTotal;
}

/** محاكاة `cancel_invoice_payment`. */
function deletePayment(invoices: Inv[], txs: Tx[], txId: string) {
  const tx = txs.find((t) => t.id === txId)!;
  const invs = invoices.map((i) =>
    i.id === tx.reference_id ? { ...i, paid_amount: Math.max(r2(i.paid_amount - Number(tx.amount)), 0) } : i,
  );
  return { invoices: invs, transactions: txs.filter((t) => t.id !== txId) };
}

/** محاكاة `revise_invoice_payment` (تغيير المبلغ). */
function editPayment(invoices: Inv[], txs: Tx[], txId: string, newAmount: number) {
  const tx = txs.find((t) => t.id === txId)!;
  const delta = r2(newAmount - Number(tx.amount));
  const invs = invoices.map((i) =>
    i.id === tx.reference_id ? { ...i, paid_amount: Math.max(r2(i.paid_amount + delta), 0) } : i,
  );
  return { invoices: invs, transactions: txs.map((t) => (t.id === txId ? { ...t, amount: newAmount } : t)) };
}

/** محاكاة `delete_customer_credit_entry` للصفوف بلا مجموعة. */
function deleteCredit(invoices: Inv[], txs: Tx[], txId: string) {
  return { invoices, transactions: txs.filter((t) => t.id !== txId) };
}

// ===== الحالة المرجعية: 3 فواتير + دفعتان نقديتان + شحنتا رصيد =====
const baseInvoices: Inv[] = [
  { id: "a", invoice_number: "A", date: "2026-01-01", total: 500, paid_amount: 500, status: "paid" },
  { id: "b", invoice_number: "B", date: "2026-02-01", total: 800, paid_amount: 600, status: "partial" },
  { id: "c", invoice_number: "C", date: "2026-03-01", total: 300, paid_amount: 200, status: "partial" },
];
const baseTxs: Tx[] = [
  { id: "pa", customer_id: "c1", category: "customer_payment", amount: 400, reference_id: "a", method: "cash", date: "2026-01-02" },
  { id: "ch1", customer_id: "c1", category: "customer_credit", amount: 200, reference_no: "OP-1", date: "2026-01-10", allocation: { group_id: "g1", kind: "surplus" } },
  { id: "cu1", customer_id: "c1", category: "customer_credit", amount: -100, reference_id: "a", date: "2026-01-11", allocation: { group_id: "g1", kind: "invoice_alloc" } },
  { id: "pa2", customer_id: "c1", category: "customer_payment", amount: 100, reference_id: "a", method: "credit_balance", date: "2026-01-11" },
  { id: "pb", customer_id: "c1", category: "customer_payment", amount: 600, reference_id: "b", method: "bank", date: "2026-02-02" },
  { id: "pc", customer_id: "c1", category: "customer_payment", amount: 200, reference_id: "c", method: "cash", date: "2026-03-02" },
  { id: "ch2", customer_id: "c1", category: "customer_credit", amount: 150, reference_no: "OP-2", date: "2026-03-10" },
];

describe("الحالة المرجعية متّزنة قبل أي عملية", () => {
  it("الصافي المحسوب = 300 مديونية − 250 رصيد دائن = 50", () => {
    expect(netBalance(baseInvoices, baseTxs)).toBe(50);
  });

  it("العرض المجمّع ودفتر الأستاذ يقفلان على نفس الرقم", () => {
    expect(displayedNet(baseInvoices, baseTxs)).toBe(50);
    expect(buildCustomerLedger({ invoices: baseInvoices, transactions: baseTxs, includeDeleted: false }).closing).toBe(50);
  });
});

describe("حذف الدفعات — الرصيد المعروض يتبع القاعدة", () => {
  it.each([
    ["دفعة نقدية على فاتورة مسددة", "pa"],
    ["دفعة بنكية على فاتورة جزئية", "pb"],
    ["دفعة نقدية على آخر فاتورة", "pc"],
  ])("حذف %s", (_label, txId) => {
    const before = netBalance(baseInvoices, baseTxs);
    const tx = baseTxs.find((t) => t.id === txId)!;
    const projected = projectDeleteImpact(tx, before).after;

    const after = deletePayment(baseInvoices, baseTxs, txId);
    const actual = netBalance(after.invoices, after.transactions);

    expect(actual).toBe(projected);
    expect(displayedNet(after.invoices, after.transactions)).toBe(actual);
  });

  it("حذف كل الدفعات النقدية تباعاً يبقي العرض مطابقاً في كل خطوة", () => {
    let state = { invoices: baseInvoices, transactions: baseTxs };
    for (const id of ["pa", "pb", "pc"]) {
      state = deletePayment(state.invoices, state.transactions, id);
      expect(displayedNet(state.invoices, state.transactions)).toBe(netBalance(state.invoices, state.transactions));
    }
    // 500+800+300 = 1600 مديونية، ناقص 100 غُطّيت من الرصيد، ناقص 250 رصيد دائن
    expect(netBalance(state.invoices, state.transactions)).toBe(1250);
  });
});

describe("تعديل الدفعات", () => {
  it.each([
    ["زيادة", "pb", 800],
    ["إنقاص", "pb", 300],
    ["تصفير", "pc", 0],
  ])("%s مبلغ الدفعة", (_label, txId, newAmount) => {
    const before = netBalance(baseInvoices, baseTxs);
    const tx = baseTxs.find((t) => t.id === txId)!;
    const projected = projectEditImpact(tx, before, newAmount as number).after;

    const after = editPayment(baseInvoices, baseTxs, txId, newAmount as number);
    const actual = netBalance(after.invoices, after.transactions);

    expect(actual).toBe(projected);
    expect(displayedNet(after.invoices, after.transactions)).toBe(actual);
  });

  it("رفع الدفعة إلى كامل قيمة الفاتورة يقفلها ويُبقي العرض مطابقاً", () => {
    // الحد الأعلى المسموح: `revise_invoice_payment` يرفض ما يتجاوز الإجمالي
    // (`would_overpay`) — الفائض مساره الوحيد هو splitPayment إلى رصيد دائن.
    const after = editPayment(baseInvoices, baseTxs, "pc", 300);
    const g = buildCustomerAccountView({
      invoices: after.invoices,
      transactions: after.transactions,
      netBalance: netBalance(after.invoices, after.transactions),
    }).blocks.find((x) => x.invoiceNumber === "C")!;
    expect(g.remaining).toBe(0);
    expect(displayedNet(after.invoices, after.transactions)).toBe(netBalance(after.invoices, after.transactions));
  });

  it("الفائض عبر splitPayment يظهر «له +» تحت فاتورته لا مديونية سالبة", () => {
    // دفع 400 على فاتورة C (300): 300 تُقيَّد عليها و100 تصير رصيداً دائناً
    const invoices = baseInvoices.map((i) => (i.id === "c" ? { ...i, paid_amount: 300, status: "paid" } : i));
    const txs = [
      ...baseTxs.filter((t) => t.id !== "pc"),
      { id: "pc", customer_id: "c1", category: "customer_payment", amount: 300, reference_id: "c", method: "cash", date: "2026-03-02" },
      { id: "oc", customer_id: "c1", category: "customer_credit", amount: 100, reference_id: "c", date: "2026-03-02", description: "فائض دفعة على فاتورة C" },
    ];
    const g = buildCustomerAccountView({
      invoices,
      transactions: txs,
      netBalance: netBalance(invoices, txs),
    }).blocks.find((x) => x.invoiceNumber === "C")!;
    expect(g.remaining).toBe(-100);
    expect(g.linkedOverpay).toBe(100);
    expect(displayedNet(invoices, txs)).toBe(netBalance(invoices, txs));
  });
});

describe("حذف شحنات الرصيد", () => {
  it("الشحنة غير المستهلَكة تُحذف والرصيد يتبع", () => {
    const ch2 = baseTxs.find((t) => t.id === "ch2")!;
    expect(creditChargeDeletability(ch2, baseTxs).canDelete).toBe(true);

    const before = netBalance(baseInvoices, baseTxs);
    const projected = projectDeleteImpact(ch2, before).after;
    const after = deleteCredit(baseInvoices, baseTxs, "ch2");
    const actual = netBalance(after.invoices, after.transactions);

    expect(actual).toBe(projected);
    expect(actual).toBe(200);
    expect(displayedNet(after.invoices, after.transactions)).toBe(actual);
  });

  it("الشحنة المستهلَكة محميّة — ولو حُذفت لبقي صف استهلاكها بلا أصل", () => {
    const ch1 = baseTxs.find((t) => t.id === "ch1")!;
    const guard = creditChargeDeletability(ch1, baseTxs);
    expect(guard.canDelete).toBe(false);
    expect(guard.reason).toBe("explicit_consumption");
    expect(guard.linkedConsumed).toBe(100);

    // لو نُفِّذ الحذف رغم الحارس: يبقى cu1 (استهلاك ‑100) في المجموعة g1
    // بلا أي شحنة موجبة فيها — وهو تعريف المرجع اليتيم في هذه القاعدة.
    const hypothetical = deleteCredit(baseInvoices, baseTxs, "ch1");
    const orphans = hypothetical.transactions.filter(
      (t) =>
        t.category === "customer_credit" &&
        Number(t.amount) < 0 &&
        t.allocation?.group_id &&
        !hypothetical.transactions.some(
          (s) => s.category === "customer_credit" && Number(s.amount) > 0 && s.allocation?.group_id === t.allocation.group_id,
        ),
    );
    expect(orphans.map((t) => t.id)).toEqual(["cu1"]);
    // والحارس يمنع ذلك، فلا أيتام في الواقع
    expect(creditChargeDeletability(ch1, baseTxs).canDelete).toBe(false);
  });
});

describe("سلاسل عمليات مختلطة تبقى متّزنة", () => {
  it("حذف دفعة ← تعديل أخرى ← حذف شحنة", () => {
    let state = { invoices: baseInvoices, transactions: baseTxs };
    const check = () =>
      expect(displayedNet(state.invoices, state.transactions)).toBe(netBalance(state.invoices, state.transactions));

    state = deletePayment(state.invoices, state.transactions, "pa");
    check();
    state = editPayment(state.invoices, state.transactions, "pb", 800);
    check();
    state = deleteCredit(state.invoices, state.transactions, "ch2");
    check();

    // A: 500−100(من الرصيد)=400 · B: مسددة · C: 100 · رصيد دائن متبقٍ 100
    expect(netBalance(state.invoices, state.transactions)).toBe(400);
  });

  it("العرض المجمّع لا يخفي أي مبلغ: Σ المتبقي − الرصيد الدائن + التسوية = الصافي", () => {
    const combos: Array<[string, () => { invoices: Inv[]; transactions: Tx[] }]> = [
      ["الأساس", () => ({ invoices: baseInvoices, transactions: baseTxs })],
      ["بلا pa", () => deletePayment(baseInvoices, baseTxs, "pa")],
      ["بلا ch2", () => deleteCredit(baseInvoices, baseTxs, "ch2")],
      ["pb=0", () => editPayment(baseInvoices, baseTxs, "pb", 0)],
    ];
    for (const [label, make] of combos) {
      const s = make();
      const res = buildCustomerAccountView({
        invoices: s.invoices,
        transactions: s.transactions,
        netBalance: netBalance(s.invoices, s.transactions),
      });
      expect({ label, v: r2(res.totalRemaining - res.creditPoolTotal) }).toEqual({ label, v: res.accountTotal });
      expect({ label, v: res.accountTotal }).toEqual({ label, v: netBalance(s.invoices, s.transactions) });
      expect({ label, v: res.drift }).toEqual({ label, v: 0 });
    }
  });
});
