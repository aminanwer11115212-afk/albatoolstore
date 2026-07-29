import { describe, it, expect } from "vitest";
import { buildCustomerLedger } from "@/utils/buildCustomerLedger";

/**
 * السيناريو المرجعي المطلوب:
 * 1) فاتورة 1,000,000 → الرصيد 1,000,000
 * 2) دفعة 500,000     → الرصيد 500,000
 * 3) فاتورة 500,000   → الرصيد 1,000,000
 * 4) دفعة 300,000     → الرصيد 700,000
 * 5) شحن رصيد 200,000 → الرصيد 500,000
 * 6) سداد 200,000 من الرصيد (صف مدمج مدين+دائن) → الرصيد 500,000
 */
describe("buildCustomerLedger", () => {
  const accounts = new Map([["acc1", "بنك الخرطوم"]]);

  const invoices = [
    { id: "i1", invoice_number: "INV-1001", date: "2026-07-01", created_at: "2026-07-01T08:00:00Z", total: 1000000, paid_amount: 500000, status: "partial" },
    { id: "i2", invoice_number: "INV-1002", date: "2026-07-05", created_at: "2026-07-05T08:00:00Z", total: 500000, paid_amount: 500000, status: "paid" },
  ];

  const transactions = [
    { id: "t1", category: "customer_payment", method: "bank", account_id: "acc1", amount: 500000, date: "2026-07-02", created_at: "2026-07-02T09:00:00Z", reference_id: "i1", description: "دفعة" },
    { id: "t2", category: "customer_payment", method: "bank", account_id: "acc1", amount: 300000, date: "2026-07-06", created_at: "2026-07-06T09:00:00Z", reference_id: "i2", description: "دفعة رقم العملية: 774" },
    { id: "t3", category: "customer_credit", method: "bank", account_id: "acc1", amount: 200000, date: "2026-07-07", created_at: "2026-07-07T09:00:00Z", description: "شحن رصيد رقم العملية: 88", allocation: { kind: "surplus" } },
    { id: "t4", category: "customer_credit", amount: -200000, date: "2026-07-07", created_at: "2026-07-07T10:00:00Z", reference_id: "i2", description: "استهلاك رصيد", allocation: { kind: "credit_used" } },
    { id: "t5", category: "customer_payment", method: "credit_balance", amount: 200000, date: "2026-07-07", created_at: "2026-07-07T10:00:00Z", reference_id: "i2", description: "سداد من رصيد" },
  ];

  const res = buildCustomerLedger({ invoices, transactions, accountNameById: accounts });

  it("يرتّب الأحداث زمنياً ويحسب رصيداً جارياً صحيحاً", () => {
    const balances = res.events.map((e) => e.balance);
    expect(balances).toEqual([1000000, 500000, 1000000, 700000, 500000, 500000]);
  });

  it("الرصيد الختامي = 500,000 عليه", () => {
    expect(res.closing).toBe(500000);
  });

  it("يدمج استهلاك الرصيد مع دفعة credit_balance في صف واحد", () => {
    const merged = res.events.find((e) => e.kind === "credit_used")!;
    expect(merged.debit).toBe(200000);
    expect(merged.credit).toBe(200000);
    expect(res.events.filter((e) => e.kind === "payment")).toHaveLength(2);
  });

  it("يستخرج رقم العملية ويعرض اسم الحساب", () => {
    const pay = res.events.find((e) => e.id === "pay:t2")!;
    expect(pay.operationNo).toBe("774");
    expect(pay.accountLabel).toBe("بنك الخرطوم");
  });

  it("الفواتير المحذوفة لا تُحتسب في المجاميع", () => {
    const withDel = buildCustomerLedger({
      invoices,
      transactions,
      deletedInvoices: [{ invoice_id: "d1", invoice_number: "INV-999", date: "2026-07-03", total: 999, deleted_at: "2026-07-04T00:00:00Z" }],
      accountNameById: accounts,
    });
    expect(withDel.closing).toBe(500000);
    expect(withDel.events.some((e) => e.excluded)).toBe(true);
  });
});
