import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test:
 *   Simulates the full server-side flow used by InvoicesPage.handleWorkflowChange
 *   and InvoiceViewPage when updating invoice.workflow_status.
 *
 *   Uses a mocked Supabase client that backs both `invoices` and `products`
 *   tables in-memory and counts every write hitting the `products` table.
 *
 *   Asserts that stock deduction is recorded in the database EXACTLY ONCE —
 *   only on the first transition out of `quote` — regardless of how many
 *   subsequent workflow_status updates occur.
 */

// ---- In-memory "DB" ----
type WorkflowStatus = "quote" | "preparing" | "in_transit" | "done";
type InvoiceRow = {
  id: string;
  workflow_status: WorkflowStatus;
  lines: { product_id: string; quantity: number }[];
};

const invoicesTable = new Map<string, InvoiceRow>();
const productsTable = new Map<string, number>();
const productWriteCount = new Map<string, number>();
let productsUpdateCalls = 0;
let productsSelectCalls = 0;
let invoicesUpdateCalls = 0;

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: (table: string) => {
        if (table === "products") {
          return {
            select: (_cols: string) => ({
              in: async (_col: string, ids: string[]) => {
                productsSelectCalls++;
                return {
                  data: ids.map((id) => ({
                    id,
                    stock_quantity: productsTable.get(id) ?? 0,
                  })),
                  error: null,
                };
              },
            }),
            update: (vals: { stock_quantity: number }) => ({
              eq: async (_col: string, id: string) => {
                productsUpdateCalls++;
                productWriteCount.set(id, (productWriteCount.get(id) || 0) + 1);
                productsTable.set(id, vals.stock_quantity);
                return { error: null };
              },
            }),
          };
        }
        if (table === "invoices") {
          return {
            update: (vals: { workflow_status: WorkflowStatus }) => ({
              eq: async (_col: string, id: string) => {
                invoicesUpdateCalls++;
                const row = invoicesTable.get(id);
                if (row) row.workflow_status = vals.workflow_status;
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

import { supabase } from "@/integrations/supabase/client";
import { deductStockForLines } from "@/utils/stockDeduction";

/**
 * Mirrors EXACTLY the production handler in InvoicesPage.handleWorkflowChange
 * and InvoiceViewPage onChange: persist the new status first, then if we are
 * leaving "quote" for the first time, deduct stock for the invoice's lines.
 */
async function serverUpdateInvoiceWorkflowStatus(
  invoiceId: string,
  newStatus: WorkflowStatus,
): Promise<{ deducted: boolean }> {
  const inv = invoicesTable.get(invoiceId);
  if (!inv) throw new Error("invoice not found");
  const before = (inv.workflow_status || "quote") as WorkflowStatus;
  if (newStatus === before) return { deducted: false };

  await supabase.from("invoices").update({ workflow_status: newStatus }).eq("id", invoiceId);

  if (before === "quote" && newStatus !== "quote") {
    await deductStockForLines(inv.lines);
    return { deducted: true };
  }
  return { deducted: false };
}

function resetDb() {
  invoicesTable.clear();
  productsTable.clear();
  productWriteCount.clear();
  productsUpdateCalls = 0;
  productsSelectCalls = 0;
  invoicesUpdateCalls = 0;
  productsTable.set("p1", 100);
  productsTable.set("p2", 50);
}

describe("Integration: workflow_status updates → DB stock deduction occurs once", () => {
  beforeEach(() => resetDb());

  it("writes to products exactly once across quote → preparing → in_transit → done", async () => {
    invoicesTable.set("inv-A", {
      id: "inv-A",
      workflow_status: "quote",
      lines: [
        { product_id: "p1", quantity: 10 },
        { product_id: "p2", quantity: 5 },
      ],
    });

    const r1 = await serverUpdateInvoiceWorkflowStatus("inv-A", "preparing");
    const r2 = await serverUpdateInvoiceWorkflowStatus("inv-A", "in_transit");
    const r3 = await serverUpdateInvoiceWorkflowStatus("inv-A", "done");

    expect(r1.deducted).toBe(true);
    expect(r2.deducted).toBe(false);
    expect(r3.deducted).toBe(false);

    // 3 invoices.update calls (one per status change)
    expect(invoicesUpdateCalls).toBe(3);

    // Exactly one DB write per product, total 2 product update calls.
    expect(productsUpdateCalls).toBe(2);
    expect(productWriteCount.get("p1")).toBe(1);
    expect(productWriteCount.get("p2")).toBe(1);

    // Stock decreased by exactly the line quantity (not doubled / tripled).
    expect(productsTable.get("p1")).toBe(90);
    expect(productsTable.get("p2")).toBe(45);

    // Only one read of products (the single deduction batch).
    expect(productsSelectCalls).toBe(1);
  });

  it("writes to products exactly once on direct quote → done", async () => {
    invoicesTable.set("inv-B", {
      id: "inv-B",
      workflow_status: "quote",
      lines: [{ product_id: "p1", quantity: 25 }],
    });

    await serverUpdateInvoiceWorkflowStatus("inv-B", "done");

    expect(productsUpdateCalls).toBe(1);
    expect(productWriteCount.get("p1")).toBe(1);
    expect(productsTable.get("p1")).toBe(75);
  });

  it("no-op transitions never write to products", async () => {
    invoicesTable.set("inv-C", {
      id: "inv-C",
      workflow_status: "quote",
      lines: [{ product_id: "p1", quantity: 4 }],
    });

    // Stay in quote (no-op).
    const r0 = await serverUpdateInvoiceWorkflowStatus("inv-C", "quote");
    expect(r0.deducted).toBe(false);
    expect(productsUpdateCalls).toBe(0);
    expect(invoicesUpdateCalls).toBe(0);

    // Leave quote → 1 deduction.
    await serverUpdateInvoiceWorkflowStatus("inv-C", "preparing");
    expect(productsUpdateCalls).toBe(1);

    // Repeat same status (no-op).
    const r1 = await serverUpdateInvoiceWorkflowStatus("inv-C", "preparing");
    expect(r1.deducted).toBe(false);
    expect(productsUpdateCalls).toBe(1); // unchanged
    expect(productWriteCount.get("p1")).toBe(1);
    expect(productsTable.get("p1")).toBe(96);
  });

  it("invoice that starts already past quote never deducts via workflow change", async () => {
    invoicesTable.set("inv-D", {
      id: "inv-D",
      workflow_status: "preparing", // already deducted previously by creation flow
      lines: [{ product_id: "p1", quantity: 10 }],
    });

    await serverUpdateInvoiceWorkflowStatus("inv-D", "in_transit");
    await serverUpdateInvoiceWorkflowStatus("inv-D", "done");

    expect(productsUpdateCalls).toBe(0);
    expect(productWriteCount.get("p1")).toBeUndefined();
    expect(productsTable.get("p1")).toBe(100);
  });

  it("two invoices sharing the same product each deduct exactly once independently", async () => {
    invoicesTable.set("inv-E1", {
      id: "inv-E1",
      workflow_status: "quote",
      lines: [{ product_id: "p1", quantity: 10 }],
    });
    invoicesTable.set("inv-E2", {
      id: "inv-E2",
      workflow_status: "quote",
      lines: [{ product_id: "p1", quantity: 7 }],
    });

    await serverUpdateInvoiceWorkflowStatus("inv-E1", "preparing");
    await serverUpdateInvoiceWorkflowStatus("inv-E1", "done");
    await serverUpdateInvoiceWorkflowStatus("inv-E2", "preparing");
    await serverUpdateInvoiceWorkflowStatus("inv-E2", "in_transit");

    // Each invoice deducts once → 2 writes total to p1.
    expect(productsUpdateCalls).toBe(2);
    expect(productWriteCount.get("p1")).toBe(2);
    expect(productsTable.get("p1")).toBe(100 - 10 - 7);
  });
});
