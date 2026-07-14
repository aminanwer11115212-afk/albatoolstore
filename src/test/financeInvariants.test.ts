/**
 * Integration tests for finance invariants library.
 * Uses in-memory fake supabase client that mimics `.from(t).select(...).eq/neq/lt/is/not/order`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
type DB = Record<string, Row[]>;

let DB_STATE: DB = {};

function makeBuilder(table: string) {
  let rows = [...(DB_STATE[table] || [])];
  const api: any = {
    select: (_cols?: string) => api,
    eq: (k: string, v: any) => { rows = rows.filter(r => r[k] === v); return api; },
    neq: (k: string, v: any) => { rows = rows.filter(r => r[k] !== v); return api; },
    lt: (k: string, v: any) => { rows = rows.filter(r => Number(r[k]) < v); return api; },
    gt: (k: string, v: any) => { rows = rows.filter(r => Number(r[k]) > v); return api; },
    is: (k: string, v: any) => { rows = rows.filter(r => (v === null ? r[k] == null : r[k] === v)); return api; },
    not: (k: string, op: string, v: any) => {
      if (op === "is" && v === null) rows = rows.filter(r => r[k] != null);
      return api;
    },
    order: (_k: string, _o?: any) => api,
    then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => makeBuilder(t) },
}));

// Import after mock
import { runAllInvariants } from "@/lib/financeInvariants";

function findResult(report: any, id: string) {
  return report.results.find((r: any) => r.id === id);
}

beforeEach(() => { DB_STATE = {}; });

describe("financeInvariants", () => {
  it("passes all rules on empty DB", async () => {
    DB_STATE = { accounts: [], transactions: [], customers: [], invoices: [], suppliers: [], purchase_orders: [], invoice_items: [], quotes: [] };
    const r = await runAllInvariants();
    expect(r.fail).toBe(0);
    expect(r.pass).toBe(r.results.length);
  });

  it("detects account balance mismatch", async () => {
    DB_STATE = {
      accounts: [{ id: "a1", name: "Bank", balance: 1000 }],
      transactions: [{ type: "income", amount: 500, account_id: "a1" }],
      customers: [], invoices: [], suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
    };
    const r = await runAllInvariants();
    const rule = findResult(r, "acc_balance_match");
    expect(rule.pass).toBe(false);
    expect(rule.offenders[0]).toMatchObject({ name: "Bank", stored: 1000, computed: 500 });
  });

  it("detects customer balance drift", async () => {
    DB_STATE = {
      accounts: [], transactions: [],
      customers: [{ id: "c1", name: "Ali", balance: 0, credit_balance: 0 }],
      invoices: [{ customer_id: "c1", total: 300, paid_amount: 100, status: "partial", source: "regular" }],
      suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
    };
    const r = await runAllInvariants();
    const rule = findResult(r, "cust_balance_match");
    expect(rule.pass).toBe(false);
    expect(rule.offenders[0]).toMatchObject({ stored: 0, computed: 200 });
  });

  it("excludes cash (POS) invoices from customer balance", async () => {
    DB_STATE = {
      accounts: [], transactions: [],
      customers: [{ id: "c1", name: "Ali", balance: 0, credit_balance: 0 }],
      invoices: [{ customer_id: "c1", total: 300, paid_amount: 0, status: "pending", source: "pos" }],
      suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
    };
    const r = await runAllInvariants();
    expect(findResult(r, "cust_balance_match").pass).toBe(true);
  });

  it("detects POS-linked customer_payment leaking to customer card", async () => {
    DB_STATE = {
      accounts: [], customers: [],
      invoices: [{ id: "inv-pos", invoice_number: "P-1", source: "pos" }],
      transactions: [
        { id: "t1", date: "2026-01-01", amount: 50, customer_id: "c1", reference_id: "inv-pos", category: "customer_payment" },
      ],
      suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
    };
    const r = await runAllInvariants();
    const rule = findResult(r, "pos_isolation");
    expect(rule.pass).toBe(false);
    expect(rule.offenders).toHaveLength(1);
  });

  it("detects overpaid invoice", async () => {
    DB_STATE = {
      accounts: [], transactions: [], customers: [], suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
      invoices: [{ id: "i1", invoice_number: "INV-1", total: 100, paid_amount: 150, status: "paid" }],
    };
    const r = await runAllInvariants();
    expect(findResult(r, "no_overpaid").pass).toBe(false);
  });

  it("detects invalid transfer (same account)", async () => {
    DB_STATE = {
      accounts: [], customers: [], invoices: [], suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
      transactions: [
        { id: "t1", type: "transfer", date: "2026-01-01", amount: 100, account_id: "a1", to_account_id: "a1" },
      ],
    };
    const r = await runAllInvariants();
    expect(findResult(r, "transfer_integrity").pass).toBe(false);
  });

  it("detects bank transaction without account", async () => {
    DB_STATE = {
      accounts: [], customers: [], invoices: [], suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
      transactions: [
        { id: "t1", date: "2026-01-01", amount: 100, method: "bank", account_id: null, description: "test" },
      ],
    };
    const r = await runAllInvariants();
    expect(findResult(r, "bank_tx_has_account").pass).toBe(false);
  });

  it("detects orphan invoice items", async () => {
    DB_STATE = {
      accounts: [], transactions: [], customers: [], suppliers: [], purchase_orders: [], quotes: [],
      invoices: [{ id: "i1" }],
      invoice_items: [{ id: "it1", invoice_id: "i-ghost", product_id: "p1", quantity: 1 }],
    };
    const r = await runAllInvariants();
    expect(findResult(r, "no_orphan_invoice_items").pass).toBe(false);
  });

  it("report is sorted with failures first", async () => {
    DB_STATE = {
      accounts: [{ id: "a1", name: "X", balance: 999 }],
      transactions: [],
      customers: [], invoices: [], suppliers: [], purchase_orders: [], invoice_items: [], quotes: [],
    };
    const r = await runAllInvariants();
    expect(r.results[0].pass).toBe(false);
    expect(r.fail).toBeGreaterThan(0);
  });
});
