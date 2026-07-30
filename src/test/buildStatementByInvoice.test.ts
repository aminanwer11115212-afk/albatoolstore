/**
 * البند 3 — كشف حساب العميل مجمّعاً حسب الفاتورة.
 *
 * الشرط الحاكم: المجموع النهائي يطابق `net_balance` المحسوب من القاعدة في كل
 * السيناريوهات، والتسوية تظهر تحت فاتورتها بالأرقام التي طلبها المثال:
 * السابق / المدفوع / الفائض بعد التغطية.
 */
import { describe, it, expect } from "vitest";
import { buildStatementByInvoice } from "@/utils/buildStatementByInvoice";
import { buildCustomerLedger } from "@/utils/buildCustomerLedger";

const CUST = "cust-1";

/** net_balance بنفس قاعدة recompute_customer_balance. */
const netBalanceOfData = (invoices: any[], txs: any[]) => {
  const debt = invoices
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + Math.max(Number(i.total || 0) - Number(i.paid_amount || 0), 0), 0);
  const credit = txs
    .filter((t) => t.category === "customer_credit")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return Math.round((debt - credit) * 100) / 100;
};

const inv = (over: any) => ({
  id: over.id,
  invoice_number: over.invoice_number || over.id,
  date: over.date || "2026-01-01",
  total: 0,
  paid_amount: 0,
  status: "pending",
  ...over,
});

const tx = (over: any) => ({
  id: over.id,
  customer_id: CUST,
  date: over.date || "2026-01-01",
  ...over,
});

describe("المثال الدقيق من البند 3", () => {
  // فاتورة 500 — دفع العميل 400 — المتبقي 100.
  // شحن رصيد 200 يغطّي الـ100: السابق 100، المدفوع 100، الفائض 100.
  const invoices = [inv({ id: "inv-1", invoice_number: "INV-1", date: "2026-01-01", total: 500, paid_amount: 500, status: "paid" })];
  const transactions = [
    tx({ id: "p1", category: "customer_payment", amount: 400, reference_id: "inv-1", method: "cash", date: "2026-01-02" }),
    tx({ id: "c1", category: "customer_credit", amount: 200, reference_no: "OP-1", date: "2026-02-01", allocation: { group_id: "g1", kind: "surplus" } }),
    tx({ id: "u1", category: "customer_credit", amount: -100, date: "2026-02-02", description: "سداد فاتورة INV-1 من رصيد", reference_id: "inv-1", allocation: { group_id: "g1", kind: "invoice_alloc" } }),
    tx({ id: "p2", category: "customer_payment", amount: 100, method: "credit_balance", reference_id: "inv-1", date: "2026-02-02" }),
  ];
  const net = netBalanceOfData(invoices, transactions);
  const res = buildStatementByInvoice({ invoices, transactions, netBalance: net });

  it("الرصيد الصافي = 100 رصيد دائن للعميل", () => {
    expect(net).toBe(-100);
  });

  it("الفاتورة سطر مستقل بقيمتها ومتبقيها", () => {
    expect(res.groups).toHaveLength(1);
    const g = res.groups[0];
    expect(g.invoiceNumber).toBe("INV-1");
    expect(g.total).toBe(500);
    expect(g.paidDirect).toBe(400);
    expect(g.paidFromCredit).toBe(100);
    expect(g.remaining).toBe(0);
  });

  it("التسوية تحت الفاتورة: السابق 100 — المدفوع 100 — الفائض بعد التغطية 100", () => {
    const s = res.groups[0].settlements[0];
    expect(s.previousRemaining).toBe(100);
    expect(s.applied).toBe(100);
    expect(s.remainingAfter).toBe(0);
    expect(s.chargeAmount).toBe(200);
    expect(s.chargeSurplusAfter).toBe(100);
    expect(s.chargeRef).toBe("OP-1");
  });

  it("المجموع النهائي يطابق net_balance بلا أي تسوية مُرحَّلة", () => {
    expect(res.totalDue).toBe(0);
    expect(res.totalCredit).toBe(100);
    expect(res.closing).toBe(net);
    expect(res.reconciliation).toBe(0);
  });

  it("يطابق أيضاً ما يقفل عليه buildCustomerLedger (لم يتغيّر منطق الحساب)", () => {
    expect(buildCustomerLedger({ invoices, transactions, includeDeleted: false }).closing).toBe(res.closing);
  });
});

describe("سيناريوهات متعددة الفواتير والشحنات", () => {
  it("فاتورتان بدون أي شحنة — المجموع = مجموع المتبقي", () => {
    const invoices = [
      inv({ id: "a", invoice_number: "A", total: 500, paid_amount: 200 }),
      inv({ id: "b", invoice_number: "B", total: 300, paid_amount: 0 }),
    ];
    const transactions = [tx({ id: "p1", category: "customer_payment", amount: 200, reference_id: "a" })];
    const net = netBalanceOfData(invoices, transactions);
    const res = buildStatementByInvoice({ invoices, transactions, netBalance: net });
    expect(res.groups.map((g) => g.remaining)).toEqual([300, 300]);
    expect(res.totalDue).toBe(600);
    expect(res.closing).toBe(net);
    expect(res.reconciliation).toBe(0);
  });

  it("شحنة واحدة تغطّي فاتورتين — كل تسوية تحت فاتورتها والفائض يتناقص", () => {
    const invoices = [
      inv({ id: "a", invoice_number: "A", date: "2026-01-01", total: 300, paid_amount: 300, status: "paid" }),
      inv({ id: "b", invoice_number: "B", date: "2026-01-05", total: 400, paid_amount: 200 }),
    ];
    const transactions = [
      tx({ id: "c1", category: "customer_credit", amount: 500, reference_no: "OP-9", date: "2026-02-01", allocation: { group_id: "g1" } }),
      tx({ id: "u1", category: "customer_credit", amount: -300, date: "2026-02-02", reference_id: "a", allocation: { group_id: "g1" } }),
      tx({ id: "pa", category: "customer_payment", amount: 300, method: "credit_balance", reference_id: "a", date: "2026-02-02" }),
      tx({ id: "u2", category: "customer_credit", amount: -200, date: "2026-02-03", reference_id: "b", allocation: { group_id: "g1" } }),
      tx({ id: "pb", category: "customer_payment", amount: 200, method: "credit_balance", reference_id: "b", date: "2026-02-03" }),
    ];
    const net = netBalanceOfData(invoices, transactions);
    const res = buildStatementByInvoice({ invoices, transactions, netBalance: net });

    const [ga, gb] = res.groups;
    expect(ga.settlements[0]).toMatchObject({ previousRemaining: 300, applied: 300, remainingAfter: 0, chargeSurplusAfter: 200 });
    expect(gb.settlements[0]).toMatchObject({ previousRemaining: 400, applied: 200, remainingAfter: 200, chargeSurplusAfter: 0 });
    expect(res.totalDue).toBe(200);
    expect(res.totalCredit).toBe(0);
    expect(res.closing).toBe(net);
    expect(res.closing).toBe(200);
    expect(res.reconciliation).toBe(0);
  });

  it("شحنتان وفاتورة واحدة — الفائض غير المستهلَك يُجمع كرصيد دائن", () => {
    const invoices = [inv({ id: "a", invoice_number: "A", total: 100, paid_amount: 100, status: "paid" })];
    const transactions = [
      tx({ id: "c1", category: "customer_credit", amount: 100, date: "2026-01-01", allocation: { group_id: "g1" } }),
      tx({ id: "c2", category: "customer_credit", amount: 250, date: "2026-01-02", allocation: { group_id: "g2" } }),
      tx({ id: "u1", category: "customer_credit", amount: -100, date: "2026-01-03", reference_id: "a", allocation: { group_id: "g1" } }),
      tx({ id: "p1", category: "customer_payment", amount: 100, method: "credit_balance", reference_id: "a", date: "2026-01-03" }),
    ];
    const net = netBalanceOfData(invoices, transactions);
    const res = buildStatementByInvoice({ invoices, transactions, netBalance: net });
    expect(res.totalDue).toBe(0);
    expect(res.totalCredit).toBe(250);
    expect(res.closing).toBe(net);
    expect(res.closing).toBe(-250);
  });

  it("فاتورة ملغاة لا تدخل المجموعات ولا المجموع", () => {
    const invoices = [
      inv({ id: "a", invoice_number: "A", total: 500, paid_amount: 0 }),
      inv({ id: "x", invoice_number: "X", total: 900, paid_amount: 0, status: "cancelled" }),
    ];
    const res = buildStatementByInvoice({ invoices, transactions: [], netBalance: netBalanceOfData(invoices, []) });
    expect(res.groups.map((g) => g.invoiceNumber)).toEqual(["A"]);
    expect(res.totalDue).toBe(500);
    expect(res.closing).toBe(500);
  });

  it("لا فواتير ولا حركات — كشف فارغ متّزن", () => {
    const res = buildStatementByInvoice({ invoices: [], transactions: [], netBalance: 0 });
    expect(res.groups).toHaveLength(0);
    expect(res.closing).toBe(0);
    expect(res.reconciliation).toBe(0);
  });

  it("انحراف عن net_balance المخزَّن يظهر كتسوية مُرحَّلة فلا ينحرف المجموع", () => {
    const invoices = [inv({ id: "a", invoice_number: "A", total: 500, paid_amount: 0 })];
    // الرصيد المخزَّن 620 (فيه أثر لا تعكسه الفواتير المعروضة)
    const res = buildStatementByInvoice({ invoices, transactions: [], netBalance: 620 });
    expect(res.closing).toBe(620);
    expect(res.reconciliation).toBe(120);
    expect(res.totalDue - res.totalCredit + res.reconciliation).toBe(res.closing);
  });

  it("بلا net_balance مُمرَّر يعتمد المحسوب من الفواتير والشحنات", () => {
    const invoices = [inv({ id: "a", invoice_number: "A", total: 500, paid_amount: 100 })];
    const res = buildStatementByInvoice({ invoices, transactions: [] });
    expect(res.closing).toBe(400);
    expect(res.reconciliation).toBe(0);
  });
});

describe("ترتيب أولوية استهلاك الرصيد", () => {
  const invoices = [inv({ id: "a", invoice_number: "A", date: "2026-03-01", total: 100, paid_amount: 100, status: "paid" })];
  // شحنتان بلا ربط صريح — التوزيع يتبع إعداد الشركة
  const transactions = [
    tx({ id: "c-old", category: "customer_credit", amount: 100, reference_no: "OLD", date: "2026-01-01" }),
    tx({ id: "c-new", category: "customer_credit", amount: 100, reference_no: "NEW", date: "2026-02-01" }),
    tx({ id: "u1", category: "customer_credit", amount: -100, date: "2026-03-02", reference_id: "a" }),
    tx({ id: "p1", category: "customer_payment", amount: 100, method: "credit_balance", reference_id: "a", date: "2026-03-02" }),
  ];

  it("FIFO يستهلك الأقدم", () => {
    const res = buildStatementByInvoice({ invoices, transactions, order: "fifo" });
    expect(res.groups[0].settlements[0].chargeRef).toBe("OLD");
  });

  it("LIFO يستهلك الأحدث", () => {
    const res = buildStatementByInvoice({ invoices, transactions, order: "lifo" });
    expect(res.groups[0].settlements[0].chargeRef).toBe("NEW");
  });

  it("المجموع النهائي واحد مهما كان الترتيب", () => {
    const net = netBalanceOfData(invoices, transactions);
    expect(buildStatementByInvoice({ invoices, transactions, order: "fifo", netBalance: net }).closing).toBe(net);
    expect(buildStatementByInvoice({ invoices, transactions, order: "lifo", netBalance: net }).closing).toBe(net);
  });
});
