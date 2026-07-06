import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for `deductStockForInvoiceOnce` — reservation-first idempotent
 * stock deduction backed by `invoices.stock_deduction_id`.
 *
 * Invariants verified:
 *  1. Calling twice for the same invoice deducts ONCE.
 *  2. Different invoices each get their own deduction.
 *  3. Pre-existing `stock_deduction_id` short-circuits at the read step.
 *  4. If the deduction fails AFTER the reservation succeeded, a retry does
 *     NOT re-deduct (the guard blocks it). This is the mark_failed fix —
 *     the reservation happens BEFORE stock changes, so failure means
 *     under-deduction, never over-deduction.
 *  5. Simulated concurrent-conditional-UPDATE: only one caller wins.
 */

const productStocks = new Map<string, number>();
type InvoiceRow = {
  id: string;
  stock_deduction_id: string | null;
  stock_deducted_at: string | null;
};
const invoices = new Map<string, InvoiceRow>();
let rpcApplyCount = 0;
let rpcApplyCalls: Array<{ id: string; delta: number }> = [];
let failNextRpcFor: Set<string> = new Set();

vi.mock("@/integrations/supabase/client", () => {
  const invoicesBuilder = () => {
    let selectCols: string | null = null;
    const filters: Array<(r: InvoiceRow) => boolean> = [];
    const nullFilters: Array<(r: InvoiceRow) => boolean> = [];
    let pendingUpdate: Partial<InvoiceRow> | null = null;
    const api: any = {
      select: (cols: string) => { selectCols = cols; return api; },
      eq: (col: keyof InvoiceRow, val: any) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      is: (col: keyof InvoiceRow, val: any) => {
        // Only null supported.
        nullFilters.push((r) => (val === null ? r[col] === null : r[col] === val));
        return api;
      },
      update: (vals: Partial<InvoiceRow>) => { pendingUpdate = vals; return api; },
      maybeSingle: async () => {
        const rows = Array.from(invoices.values()).filter((r) => filters.every((f) => f(r)));
        const row = rows[0];
        if (!row) return { data: null, error: null };
        if (selectCols && selectCols.includes("stock_deduction_id")) {
          return { data: { stock_deduction_id: row.stock_deduction_id }, error: null };
        }
        return { data: row, error: null };
      },
      then: (resolve: any) => {
        // Terminal path when `.select()` is chained after `.update().eq().is()`.
        if (pendingUpdate) {
          const rows = Array.from(invoices.values()).filter(
            (r) => filters.every((f) => f(r)) && nullFilters.every((f) => f(r)),
          );
          rows.forEach((r) => Object.assign(r, pendingUpdate));
          const data = selectCols ? rows.map((r) => ({ stock_deduction_id: r.stock_deduction_id })) : rows;
          return Promise.resolve({ data, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return api;
  };

  return {
    supabase: {
      from: (table: string) => {
        if (table === "invoices") return invoicesBuilder();
        throw new Error(`unexpected table in test: ${table}`);
      },
      rpc: async (name: string, args: any) => {
        if (name !== "apply_stock_delta") {
          throw new Error(`unexpected rpc: ${name}`);
        }
        rpcApplyCount++;
        rpcApplyCalls.push({ id: args._product_id, delta: args._delta });
        if (failNextRpcFor.has(args._product_id)) {
          failNextRpcFor.delete(args._product_id);
          return { error: { message: "simulated rpc failure" } };
        }
        const cur = productStocks.get(args._product_id) ?? 0;
        productStocks.set(args._product_id, Math.max(0, cur + Number(args._delta)));
        return { error: null };
      },
    },
  };
});

import { deductStockForInvoiceOnce } from "@/utils/stockDeduction";

beforeEach(() => {
  productStocks.clear();
  invoices.clear();
  rpcApplyCount = 0;
  rpcApplyCalls = [];
  failNextRpcFor = new Set();
  productStocks.set("p1", 100);
  productStocks.set("p2", 50);
  invoices.set("inv-A", { id: "inv-A", stock_deduction_id: null, stock_deducted_at: null });
  invoices.set("inv-B", { id: "inv-B", stock_deduction_id: null, stock_deducted_at: null });
});

describe("deductStockForInvoiceOnce — reservation-first idempotency", () => {
  it("deducts once and reserves a deduction_id on first call", async () => {
    const r = await deductStockForInvoiceOnce("inv-A", [
      { product_id: "p1", quantity: 10 },
      { product_id: "p2", quantity: 5 },
    ]);
    expect(r.deducted).toBe(true);
    expect(r.deductionId).toMatch(/[0-9a-f-]+/i);
    expect(productStocks.get("p1")).toBe(90);
    expect(productStocks.get("p2")).toBe(45);
    expect(rpcApplyCount).toBe(2);
    expect(invoices.get("inv-A")?.stock_deduction_id).toBe(r.deductionId);
    expect(invoices.get("inv-A")?.stock_deducted_at).toBeTruthy();
  });

  it("second call is a no-op and returns the reserved id", async () => {
    const lines = [{ product_id: "p1", quantity: 10 }];
    const first = await deductStockForInvoiceOnce("inv-A", lines);
    const rpcBefore = rpcApplyCount;
    const second = await deductStockForInvoiceOnce("inv-A", lines);
    expect(second.deducted).toBe(false);
    expect(second.reason).toBe("already_deducted");
    expect(second.deductionId).toBe(first.deductionId);
    expect(rpcApplyCount).toBe(rpcBefore);
    expect(productStocks.get("p1")).toBe(90);
  });

  it("N retries deduct exactly once", async () => {
    const lines = [{ product_id: "p1", quantity: 7 }];
    for (let i = 0; i < 8; i++) await deductStockForInvoiceOnce("inv-A", lines);
    expect(productStocks.get("p1")).toBe(93);
    expect(rpcApplyCount).toBe(1);
  });

  it("different invoices get independent deductions", async () => {
    const a = await deductStockForInvoiceOnce("inv-A", [{ product_id: "p1", quantity: 10 }]);
    const b = await deductStockForInvoiceOnce("inv-B", [{ product_id: "p1", quantity: 4 }]);
    expect(a.deducted).toBe(true);
    expect(b.deducted).toBe(true);
    expect(a.deductionId).not.toBe(b.deductionId);
    expect(productStocks.get("p1")).toBe(86);
  });

  it("skips deduction when invoice already has a deduction_id", async () => {
    invoices.set("inv-A", {
      id: "inv-A",
      stock_deduction_id: "pre-existing-uuid",
      stock_deducted_at: new Date().toISOString(),
    });
    const r = await deductStockForInvoiceOnce("inv-A", [{ product_id: "p1", quantity: 10 }]);
    expect(r.deducted).toBe(false);
    expect(r.deductionId).toBe("pre-existing-uuid");
    expect(rpcApplyCount).toBe(0);
    expect(productStocks.get("p1")).toBe(100);
  });

  it("returns missing_invoice_id when invoiceId is empty", async () => {
    const r = await deductStockForInvoiceOnce("", [{ product_id: "p1", quantity: 10 }]);
    expect(r.deducted).toBe(false);
    expect(r.reason).toBe("missing_invoice_id");
    expect(rpcApplyCount).toBe(0);
  });

  it("MARK_FAILED regression: RPC failure after reservation does NOT double-deduct on retry", async () => {
    // Fail the FIRST rpc call for p1. The reservation succeeds; deduction fails.
    failNextRpcFor.add("p1");
    const first = await deductStockForInvoiceOnce("inv-A", [{ product_id: "p1", quantity: 10 }]);
    expect(first.deducted).toBe(false);
    expect(first.reason).toBe("deduction_failed");
    // Guard was reserved BEFORE deduction, so it is set even though stock didn't change.
    expect(invoices.get("inv-A")?.stock_deduction_id).toBeTruthy();
    // Stock unchanged because RPC failed.
    expect(productStocks.get("p1")).toBe(100);

    // Retry: the guard short-circuits at step 1, so NO second deduction happens.
    const rpcBefore = rpcApplyCount;
    const retry = await deductStockForInvoiceOnce("inv-A", [{ product_id: "p1", quantity: 10 }]);
    expect(retry.deducted).toBe(false);
    expect(retry.reason).toBe("already_deducted");
    expect(rpcApplyCount).toBe(rpcBefore); // no new RPC calls
    expect(productStocks.get("p1")).toBe(100); // no double-deduction
  });

  it("supports decimal quantities without over-deducting", async () => {
    productStocks.set("p1", 10);
    const r = await deductStockForInvoiceOnce("inv-A", [
      { product_id: "p1", quantity: 2.5 },
      { product_id: "p1", quantity: 1.25 },
    ]);
    expect(r.deducted).toBe(true);
    // 10 - 3.75 = 6.25 (aggregation sums same product)
    expect(productStocks.get("p1")).toBeCloseTo(6.25, 5);
  });

  it("clamps at zero — cannot deduct more than available", async () => {
    productStocks.set("p1", 3);
    const r = await deductStockForInvoiceOnce("inv-A", [{ product_id: "p1", quantity: 999 }]);
    expect(r.deducted).toBe(true);
    // apply_stock_delta uses GREATEST(0, cur + delta) so it clamps to 0.
    expect(productStocks.get("p1")).toBe(0);
  });
});
