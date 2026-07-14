import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test for deleteInvoiceWithStockRestore.
 * We mock the supabase client + stockDeduction utility to verify that:
 *  1. Stock is restored for BOTH "new" (has stock_deduction_id) and "legacy"
 *     invoices (no stock_deduction_id but workflow_status ≠ "new").
 *  2. The invoice row is deleted exactly once (no duplicate delete calls).
 *  3. An audit log entry is written to activity_log with action='delete'.
 *  4. The reconciliation RPC runs first (payments → credit) before deletion.
 */

const stockApplied: Array<{ before: any[]; after: any[] }> = [];
vi.mock("@/utils/stockDeduction", () => ({
  applyStockDeltaForLines: vi.fn(async (before: any[], after: any[]) => {
    stockApplied.push({ before, after });
  }),
}));

type Row = Record<string, any>;
const state = {
  invoiceRow: null as Row | null,
  items: [] as Row[],
  deletedInvoices: [] as string[],
  auditInserts: [] as Row[],
  rpcCalls: [] as { fn: string; args: any }[],
};

function makeBuilder(table: string) {
  const b: any = {
    _table: table,
    _filters: {} as Row,
    select: () => b,
    eq(col: string, val: any) { b._filters[col] = val; return b; },
    in() { return b; },
    async maybeSingle() {
      if (table === "invoices") return { data: state.invoiceRow, error: null };
      return { data: null, error: null };
    },
    then(res: any) {
      // for select without maybeSingle
      if (table === "invoice_items") return res({ data: state.items, error: null });
      return res({ data: [], error: null });
    },
    async delete() {
      // returns a thenable filtered by eq
      return {
        eq: async (col: string, val: any) => {
          if (table === "invoices" && col === "id") {
            state.deletedInvoices.push(val);
          }
          return { error: null };
        },
        in: async () => ({ error: null }),
      };
    },
    async insert(row: any) {
      if (table === "activity_log") state.auditInserts.push(row);
      return { error: null };
    },
  };
  // handle chained .delete().eq() / .delete().in()
  const origDelete = b.delete.bind(b);
  b.delete = () => {
    const chain: any = {
      eq: async (col: string, val: any) => {
        if (table === "invoices" && col === "id") state.deletedInvoices.push(val);
        return { error: null };
      },
      in: async () => ({ error: null }),
    };
    return chain;
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "tester@example.com" } } }) },
    rpc: async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args });
      if (fn === "delete_invoice_with_reconciliation") {
        return { data: { paid_amount: state.invoiceRow?.paid_amount || 0 }, error: null };
      }
      return { data: null, error: null };
    },
  },
}));

// Import after mocks
import { deleteInvoiceWithStockRestore } from "@/utils/deleteInvoice";

beforeEach(() => {
  state.invoiceRow = null;
  state.items = [];
  state.deletedInvoices = [];
  state.auditInserts = [];
  state.rpcCalls = [];
  stockApplied.length = 0;
});

describe("deleteInvoiceWithStockRestore — integration", () => {
  it("new invoice (with stock_deduction_id) → restores stock, deletes once, writes audit", async () => {
    state.invoiceRow = {
      id: "inv-1",
      invoice_number: "INV-001",
      date: "2026-07-14",
      stock_deduction_id: "sd-1",
      workflow_status: "preparing",
      paid_amount: 0,
    };
    state.items = [{ product_id: "p1", quantity: 3 }, { product_id: "p2", quantity: 5 }];

    const res = await deleteInvoiceWithStockRestore("inv-1");

    expect(res.restoredStock).toBe(true);
    expect(res.invoiceNumber).toBe("INV-001");
    expect(res.restoredItems).toEqual([
      { product_id: "p1", quantity: 3 },
      { product_id: "p2", quantity: 5 },
    ]);
    expect(state.deletedInvoices).toEqual(["inv-1"]); // exactly once, no duplicates
    expect(stockApplied.length).toBe(1);
    expect(state.rpcCalls[0]?.fn).toBe("delete_invoice_with_reconciliation");
    expect(state.auditInserts.length).toBe(1);
    expect(state.auditInserts[0].action).toBe("delete");
    expect(state.auditInserts[0].entity_type).toBe("invoice");
    expect(state.auditInserts[0].user_email).toBe("tester@example.com");
    expect(state.auditInserts[0].details.restored_stock).toBe(true);
  });

  it("legacy invoice (no stock_deduction_id but workflow ≠ new) → still restores stock", async () => {
    state.invoiceRow = {
      id: "inv-legacy",
      invoice_number: "INV-LEG",
      date: "2025-01-01",
      stock_deduction_id: null,
      stock_deducted_at: null,
      workflow_status: "done",
      paid_amount: 0,
    };
    state.items = [{ product_id: "p9", quantity: 2 }];

    const res = await deleteInvoiceWithStockRestore("inv-legacy");

    expect(res.restoredStock).toBe(true);
    expect(stockApplied.length).toBe(1);
    expect(state.deletedInvoices).toEqual(["inv-legacy"]);
  });

  it("draft-new invoice (workflow=new, no deduction) → deletes without touching stock", async () => {
    state.invoiceRow = {
      id: "inv-new",
      invoice_number: "INV-N",
      date: "2026-07-14",
      stock_deduction_id: null,
      stock_deducted_at: null,
      workflow_status: "new",
      paid_amount: 0,
    };
    state.items = [{ product_id: "p1", quantity: 1 }];

    const res = await deleteInvoiceWithStockRestore("inv-new");

    expect(res.restoredStock).toBe(false);
    expect(res.restoredItems).toEqual([]);
    expect(stockApplied.length).toBe(0);
    expect(state.deletedInvoices).toEqual(["inv-new"]);
  });
});
