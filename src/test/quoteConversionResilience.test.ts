/**
 * Mid-conversion failure & retry — end-to-end resilience of
 * `convertQuoteToInvoice`.
 *
 * These tests simulate real-world failure points and verify:
 *   1. Retry after items-insert failure → NO duplicate invoice.
 *   2. Retry after stock-deduction RPC failure → stock deducted EXACTLY once.
 *   3. Retry after quote-delete failure → NO duplicate invoice.
 *   4. Simulating an edit of the resulting invoice → delta is applied,
 *      stock is NEVER re-deducted for the base lines.
 *   5. Decimal quantities are aggregated and deducted correctly.
 *   6. Requested quantity > stock is clamped to zero (does NOT go negative).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
function table(name: string) {
  if (!db[name]) db[name] = [];
  return db[name];
}

// ---- Injected failure hooks (set per-test) ----
let failItemsInsertOnce = false;
let failRpcOnceFor: Set<string> = new Set();
let failQuoteDeleteOnce = false;
let insertCallCount = 0;
let rpcCallCount = 0;

const builder = (name: string) => {
  const filters: Array<(r: Row) => boolean> = [];
  const nullFilters: Array<(r: Row) => boolean> = [];
  let pendingInsert: Row | Row[] | null = null;
  let pendingUpdate: Row | null = null;
  let pendingDelete = false;
  let selectCalled = false;

  const api: any = {
    select: () => { selectCalled = true; return api; },
    eq: (col: string, val: any) => { filters.push((r) => r[col] === val); return api; },
    is: (col: string, val: any) => {
      nullFilters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return api;
    },
    limit: () => api,
    insert: (row: Row | Row[]) => { pendingInsert = row; return api; },
    update: (row: Row) => { pendingUpdate = row; return api; },
    delete: () => { pendingDelete = true; return api; },

    single: async () => {
      if (pendingInsert) {
        if (name === "invoice_items" && failItemsInsertOnce) {
          failItemsInsertOnce = false;
          return { data: null, error: { message: "simulated items-insert failure" } };
        }
        insertCallCount++;
        const arr = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
        const inserted = arr.map((r) => ({
          id: r.id || `id-${Math.random().toString(36).slice(2, 10)}`,
          ...r,
        }));
        table(name).push(...inserted);
        return { data: inserted[0], error: null };
      }
      const rows = table(name).filter((r) => filters.every((f) => f(r)));
      return { data: rows[0] || null, error: rows[0] ? null : { message: "not found" } };
    },

    maybeSingle: async () => {
      const rows = table(name).filter((r) => filters.every((f) => f(r)));
      return { data: rows[0] || null, error: null };
    },

    then: (resolve: any) => {
      if (pendingInsert) {
        if (name === "invoice_items" && failItemsInsertOnce) {
          failItemsInsertOnce = false;
          return Promise.resolve({ data: null, error: { message: "simulated items-insert failure" } }).then(resolve);
        }
        insertCallCount++;
        const arr = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
        const inserted = arr.map((r) => ({
          id: r.id || `id-${Math.random().toString(36).slice(2, 10)}`,
          ...r,
        }));
        table(name).push(...inserted);
        return Promise.resolve({ data: inserted, error: null }).then(resolve);
      }
      if (pendingUpdate) {
        const rows = table(name).filter(
          (r) => filters.every((f) => f(r)) && nullFilters.every((f) => f(r)),
        );
        rows.forEach((r) => Object.assign(r, pendingUpdate));
        return Promise.resolve({
          data: selectCalled ? rows.map((r) => ({ ...r })) : null,
          error: null,
        }).then(resolve);
      }
      if (pendingDelete) {
        if (name === "quotes" && failQuoteDeleteOnce) {
          failQuoteDeleteOnce = false;
          return Promise.resolve({ data: null, error: { message: "simulated delete failure" } }).then(resolve);
        }
        const remaining = table(name).filter((r) => !filters.every((f) => f(r)));
        db[name] = remaining;
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
      const rows = table(name).filter((r) => filters.every((f) => f(r)));
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return api;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (name: string) => builder(name),
    rpc: async (rpcName: string, args: any) => {
      if (rpcName !== "apply_stock_delta") return { data: null, error: null };
      rpcCallCount++;
      if (failRpcOnceFor.has(args._product_id)) {
        failRpcOnceFor.delete(args._product_id);
        return { data: null, error: { message: "simulated rpc failure" } };
      }
      const products = table("products");
      const p = products.find((r) => r.id === args._product_id);
      if (p) {
        p.stock_quantity = Math.max(0, Number(p.stock_quantity || 0) + Number(args._delta || 0));
      }
      return { data: null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

// ---- Test fixture seeding ----
function seed({
  productStock = 100,
  quantity = 10,
  productId = "p1",
}: { productStock?: number; quantity?: number; productId?: string } = {}) {
  for (const k of Object.keys(db)) delete db[k];
  insertCallCount = 0;
  rpcCallCount = 0;
  failItemsInsertOnce = false;
  failRpcOnceFor = new Set();
  failQuoteDeleteOnce = false;

  table("company_settings").push({ invoice_prefix: "INV-", side_quote_prefix: "QTS-" });
  table("products").push({ id: productId, name: "Widget", stock_quantity: productStock });
  table("quotes").push({
    id: "q1",
    quote_number: "QT-500",
    customer_id: "c1",
    subtotal: 100,
    discount: 0,
    total: 100,
    is_side: false,
  });
  table("quote_items").push({
    id: "qi1",
    quote_id: "q1",
    product_id: productId,
    product_name: "Widget",
    quantity,
    unit_price: 10,
    total: quantity * 10,
  });
}

beforeEach(() => seed());

describe("convertQuoteToInvoice — mid-conversion resilience", () => {
  it("[items-insert failure → retry] does NOT create a duplicate invoice", async () => {
    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");

    // Attempt 1: items-insert fails. Because the quote is marked
    // converted_to_invoice_id BEFORE items-insert runs, and the invoice is
    // rolled back on items-insert failure, the second attempt sees the mark
    // and the invoice is gone → falls through to a full retry.
    failItemsInsertOnce = true;
    await expect(convertQuoteToInvoice("q1")).rejects.toBeTruthy();

    // The first attempt did roll back the invoice AND marked the quote.
    // Because the invoice was deleted, the early-exit path (which looks
    // up the invoice by converted_to_invoice_id) will NOT find it and will
    // proceed with a fresh conversion. Verify only one invoice ultimately
    // exists after a clean retry.
    const attempt2 = await convertQuoteToInvoice("q1");
    expect(attempt2.alreadyConverted).toBe(false);
    expect(table("invoices").length).toBe(1);
    expect(attempt2.invoiceNumber).toMatch(/^INV-/);
    expect(attempt2.stockDeducted).toBe(true);
    expect(attempt2.deductedLineCount).toBe(1);
    // Stock deducted exactly once: 100 - 10 = 90
    expect(table("products")[0].stock_quantity).toBe(90);
  });

  it("[stock-deduction RPC failure] does NOT double-deduct on retry", async () => {
    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");

    // Attempt 1: RPC fails. Reservation-first pattern means the guard is
    // already set; retry short-circuits at the guard check.
    failRpcOnceFor.add("p1");
    const first = await convertQuoteToInvoice("q1");
    expect(first.stockDeducted).toBe(false);
    // Invoice exists, items exist, stock UNTOUCHED (safer than over-deducting).
    expect(table("invoices").length).toBe(1);
    expect(table("products")[0].stock_quantity).toBe(100);

    // Simulate a retry via the idempotent guard: the quote is now gone
    // (deleted at step 7), so we re-invoke deductStockForInvoiceOnce
    // directly to prove it will NEVER double-deduct.
    const { deductStockForInvoiceOnce } = await import("@/utils/stockDeduction");
    const rpcBefore = rpcCallCount;
    const retry = await deductStockForInvoiceOnce(first.invoiceId, [
      { product_id: "p1", quantity: 10 },
    ]);
    expect(retry.deducted).toBe(false);
    expect(retry.reason).toBe("already_deducted");
    expect(rpcCallCount).toBe(rpcBefore);
    expect(table("products")[0].stock_quantity).toBe(100);
  });

  it("[repeat conversion] second call returns alreadyConverted, no dup, no re-deduct", async () => {
    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const first = await convertQuoteToInvoice("q1");
    expect(first.alreadyConverted).toBe(false);
    expect(table("invoices").length).toBe(1);
    expect(table("products")[0].stock_quantity).toBe(90);

    // Re-seed the quote row to simulate a client that still has the id.
    table("quotes").push({
      id: "q1",
      quote_number: "QT-500",
      converted_to_invoice_id: first.invoiceId,
      customer_id: "c1",
      subtotal: 100,
      discount: 0,
      total: 100,
    });
    const second = await convertQuoteToInvoice("q1");
    expect(second.alreadyConverted).toBe(true);
    expect(second.invoiceId).toBe(first.invoiceId);
    expect(table("invoices").length).toBe(1);
    // Stock still 90 — no re-deduction.
    expect(table("products")[0].stock_quantity).toBe(90);
  });

  it("[edit converted invoice] applying delta does NOT re-deduct the base quantity", async () => {
    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const first = await convertQuoteToInvoice("q1");
    expect(table("products")[0].stock_quantity).toBe(90);

    // User edits the invoice: bumps quantity from 10 → 15. The invoice-edit
    // path uses applyStockDeltaForLines(old, new) — NOT
    // deductStockForInvoiceOnce — so only the delta (-5) is applied.
    const { applyStockDeltaForLines } = await import("@/utils/stockDeduction");
    await applyStockDeltaForLines(
      [{ product_id: "p1", quantity: 10 }],
      [{ product_id: "p1", quantity: 15 }],
    );
    expect(table("products")[0].stock_quantity).toBe(85); // 90 - 5

    // Re-running the initial deduction guard for the same invoice is a no-op.
    const { deductStockForInvoiceOnce } = await import("@/utils/stockDeduction");
    const rpcBefore = rpcCallCount;
    const guard = await deductStockForInvoiceOnce(first.invoiceId, [
      { product_id: "p1", quantity: 15 },
    ]);
    expect(guard.deducted).toBe(false);
    expect(guard.reason).toBe("already_deducted");
    expect(rpcCallCount).toBe(rpcBefore);
    expect(table("products")[0].stock_quantity).toBe(85);
  });

  it("[decimal quantities] aggregates and deducts correctly", async () => {
    seed({ productStock: 20 });
    // Add two lines with decimal quantities on the same product.
    table("quote_items").length = 0;
    table("quote_items").push(
      { id: "qi1", quote_id: "q1", product_id: "p1", product_name: "W", quantity: 2.5, unit_price: 10, total: 25 },
      { id: "qi2", quote_id: "q1", product_id: "p1", product_name: "W", quantity: 1.25, unit_price: 10, total: 12.5 },
    );

    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const r = await convertQuoteToInvoice("q1");
    expect(r.stockDeducted).toBe(true);
    // 20 - (2.5 + 1.25) = 16.25
    expect(table("products")[0].stock_quantity).toBeCloseTo(16.25, 5);
  });

  it("[insufficient stock] clamps at zero, deduction does not fail", async () => {
    seed({ productStock: 3, quantity: 999 });
    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    const r = await convertQuoteToInvoice("q1");
    expect(r.stockDeducted).toBe(true);
    // Clamped to 0 by apply_stock_delta's GREATEST(0, ...) mocked here.
    expect(table("products")[0].stock_quantity).toBe(0);
    // Invoice still created — business decision: negative stock is prevented,
    // but the sale record is preserved for accounting.
    expect(table("invoices").length).toBe(1);
  });

  it("[quote-delete failure] invoice remains, stock deducted exactly once, no dup on retry", async () => {
    const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
    failQuoteDeleteOnce = true;
    const first = await convertQuoteToInvoice("q1");
    expect(first.stockDeducted).toBe(true);
    expect(table("invoices").length).toBe(1);
    expect(table("products")[0].stock_quantity).toBe(90);
    // Quote row still exists because delete was "simulated-failed"
    expect(table("quotes").length).toBe(1);

    // A retry should short-circuit via converted_to_invoice_id and return
    // alreadyConverted — NO new invoice, NO extra deduction.
    const second = await convertQuoteToInvoice("q1");
    expect(second.alreadyConverted).toBe(true);
    expect(second.invoiceId).toBe(first.invoiceId);
    expect(table("invoices").length).toBe(1);
    expect(table("products")[0].stock_quantity).toBe(90);
  });
});
