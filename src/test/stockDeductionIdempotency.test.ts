import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for `deductStockForInvoiceOnce` — the idempotent stock-deduction
 * guard backed by `invoices.stock_deduction_id`.
 *
 * Invariants verified:
 *  1. Calling twice for the same invoice deducts ONCE; second call is a no-op
 *     and returns the same deduction id.
 *  2. Different invoices each get their own deduction.
 *  3. An invoice with a pre-existing `stock_deduction_id` is never touched.
 *
 * Note on race conditions: the guard is read-then-write at the application
 * level, not a DB-level atomic op. These tests use a sequential mock and
 * therefore do NOT validate true concurrent-write safety. They DO validate
 * all realistic application retry scenarios (refresh, double-click,
 * retry-after-failure, repeated workflow transitions).
 */

// ---- In-memory fake DB ----
const productStocks = new Map<string, number>();
type InvoiceRow = { id: string; stock_deduction_id: string | null; stock_deducted_at: string | null };
const invoices = new Map<string, InvoiceRow>();
let productUpdateCount = 0;
let invoiceUpdateCount = 0;

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: (table: string) => {
        if (table === "products") {
          return {
            select: (_cols: string) => ({
              in: async (_col: string, ids: string[]) => ({
                data: ids.map((id) => ({ id, stock_quantity: productStocks.get(id) ?? 0 })),
                error: null,
              }),
            }),
            update: (vals: { stock_quantity: number }) => ({
              eq: async (_col: string, id: string) => {
                productUpdateCount++;
                productStocks.set(id, vals.stock_quantity);
                return { error: null };
              },
            }),
          };
        }
        if (table === "invoices") {
          return {
            select: (_cols: string) => ({
              eq: (_col: string, id: string) => ({
                maybeSingle: async () => {
                  const row = invoices.get(id);
                  return {
                    data: row ? { stock_deduction_id: row.stock_deduction_id } : null,
                    error: null,
                  };
                },
              }),
            }),
            update: (vals: { stock_deduction_id?: string; stock_deducted_at?: string }) => ({
              eq: async (_col: string, id: string) => {
                invoiceUpdateCount++;
                const row = invoices.get(id);
                if (row) {
                  if (vals.stock_deduction_id !== undefined) row.stock_deduction_id = vals.stock_deduction_id;
                  if (vals.stock_deducted_at !== undefined) row.stock_deducted_at = vals.stock_deducted_at;
                }
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    },
  };
});

import { deductStockForInvoiceOnce } from "@/utils/stockDeduction";

describe("deductStockForInvoiceOnce — idempotency", () => {
  beforeEach(() => {
    productStocks.clear();
    invoices.clear();
    productUpdateCount = 0;
    invoiceUpdateCount = 0;
    productStocks.set("p1", 100);
    productStocks.set("p2", 50);
    invoices.set("inv-A", { id: "inv-A", stock_deduction_id: null, stock_deducted_at: null });
    invoices.set("inv-B", { id: "inv-B", stock_deduction_id: null, stock_deducted_at: null });
  });

  it("deducts once and writes a deduction_id on first call", async () => {
    const r = await deductStockForInvoiceOnce("inv-A", [
      { product_id: "p1", quantity: 10 },
      { product_id: "p2", quantity: 5 },
    ]);

    expect(r.deducted).toBe(true);
    expect(r.deductionId).toMatch(/[0-9a-f-]+/i);
    expect(productStocks.get("p1")).toBe(90);
    expect(productStocks.get("p2")).toBe(45);
    expect(productUpdateCount).toBe(2);
    expect(invoices.get("inv-A")?.stock_deduction_id).toBe(r.deductionId);
    expect(invoices.get("inv-A")?.stock_deducted_at).toBeTruthy();
  });

  it("second call on the same invoice is a no-op and returns the same id", async () => {
    const lines = [
      { product_id: "p1", quantity: 10 },
      { product_id: "p2", quantity: 5 },
    ];
    const first = await deductStockForInvoiceOnce("inv-A", lines);
    const productCountAfterFirst = productUpdateCount;
    const invoiceCountAfterFirst = invoiceUpdateCount;

    const second = await deductStockForInvoiceOnce("inv-A", lines);

    expect(second.deducted).toBe(false);
    expect(second.reason).toBe("already_deducted");
    expect(second.deductionId).toBe(first.deductionId);
    // No additional writes
    expect(productUpdateCount).toBe(productCountAfterFirst);
    expect(invoiceUpdateCount).toBe(invoiceCountAfterFirst);
    // Stock unchanged from first deduction
    expect(productStocks.get("p1")).toBe(90);
    expect(productStocks.get("p2")).toBe(45);
  });

  it("survives many retries — N calls deduct exactly once", async () => {
    const lines = [{ product_id: "p1", quantity: 7 }];
    for (let i = 0; i < 8; i++) {
      await deductStockForInvoiceOnce("inv-A", lines);
    }
    expect(productStocks.get("p1")).toBe(93); // 100 - 7, only once
    expect(productUpdateCount).toBe(1);
    expect(invoiceUpdateCount).toBe(1);
  });

  it("different invoices get independent deductions", async () => {
    const a = await deductStockForInvoiceOnce("inv-A", [{ product_id: "p1", quantity: 10 }]);
    const b = await deductStockForInvoiceOnce("inv-B", [{ product_id: "p1", quantity: 4 }]);

    expect(a.deducted).toBe(true);
    expect(b.deducted).toBe(true);
    expect(a.deductionId).not.toBe(b.deductionId);
    expect(productStocks.get("p1")).toBe(86); // 100 - 10 - 4
  });

  it("skips deduction entirely when invoice already has a deduction_id", async () => {
    invoices.set("inv-A", {
      id: "inv-A",
      stock_deduction_id: "pre-existing-uuid",
      stock_deducted_at: new Date().toISOString(),
    });

    const r = await deductStockForInvoiceOnce("inv-A", [{ product_id: "p1", quantity: 10 }]);

    expect(r.deducted).toBe(false);
    expect(r.deductionId).toBe("pre-existing-uuid");
    expect(productUpdateCount).toBe(0);
    expect(productStocks.get("p1")).toBe(100); // unchanged
  });

  it("returns missing_invoice_id when invoiceId is empty", async () => {
    const r = await deductStockForInvoiceOnce("", [{ product_id: "p1", quantity: 10 }]);
    expect(r.deducted).toBe(false);
    expect(r.reason).toBe("missing_invoice_id");
    expect(productUpdateCount).toBe(0);
  });
});
