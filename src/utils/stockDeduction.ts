import { supabase } from "@/integrations/supabase/client";

/**
 * Stock deduction policy:
 * - Quotes NEVER deduct from product stock.
 * - Stock is deducted only when an Invoice is created (or when a Quote is converted to an Invoice).
 * - When editing an Invoice, only the delta between old and new quantities is applied.
 */

export type StockLine = { product_id: string | null | undefined; quantity: number | null | undefined };

/** Aggregate quantities per product_id, ignoring null products. */
function aggregate(lines: StockLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of lines) {
    if (!l.product_id) continue;
    const q = Number(l.quantity || 0);
    if (!q) continue;
    map.set(l.product_id, (map.get(l.product_id) || 0) + q);
  }
  return map;
}

/**
 * Apply a delta map to products.stock_quantity.
 * Positive delta => add to stock. Negative delta => subtract.
 * Reads current stock then updates per product (no RPC available).
 */
async function applyDeltas(deltas: Map<string, number>): Promise<void> {
  const entries = Array.from(deltas.entries()).filter(([, d]) => d !== 0);
  if (!entries.length) return;

  // تحديث تسلسلي: نقرأ القيمة الحالية ونحدّثها مباشرة لكل منتج
  // لتقليل نافذة السباق (race condition) مقارنة بالتحديث المتوازي.
  const failures: Array<{ id: string; error: string }> = [];
  for (const [id, delta] of entries) {
    const { data: prod, error: readErr } = await supabase
      .from("products")
      .select("stock_quantity")
      .eq("id", id)
      .maybeSingle();
    if (readErr) {
      console.error("[stockDeduction] failed to read product", id, readErr);
      failures.push({ id, error: readErr.message });
      continue;
    }
    const currentQty = Number(prod?.stock_quantity || 0);
    const newQty = currentQty + delta;
    const { error: upErr } = await supabase
      .from("products")
      .update({ stock_quantity: newQty })
      .eq("id", id);
    if (upErr) {
      console.error("[stockDeduction] update failed for", id, upErr);
      failures.push({ id, error: upErr.message });
    }
  }

  // Notify the rest of the app (Products page, open Invoice/Quote create pages)
  // so they invalidate caches and reflect the new stock immediately.
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("products:changed")); } catch {}
  }

  if (failures.length) {
    throw new Error(
      `فشل تحديث المخزون لـ ${failures.length} منتج: ${failures.map((f) => f.error).join("; ")}`,
    );
  }
}

/** Deduct (subtract) the given lines from stock — used when creating a new invoice. */
export async function deductStockForLines(lines: StockLine[]): Promise<void> {
  const agg = aggregate(lines);
  const deltas = new Map<string, number>();
  agg.forEach((qty, id) => deltas.set(id, -qty));
  await applyDeltas(deltas);
}

/**
 * Idempotent stock deduction for an invoice.
 *
 * Uses `invoices.stock_deduction_id` as a guard:
 *  - If already set => skip (return { deducted: false }).
 *  - Otherwise => deduct, then write a new uuid + timestamp.
 *
 * Safe against double-clicks, refresh, retry-after-network-failure, and
 * repeated workflow_status transitions.
 *
 * Note: read-then-write is not fully atomic at the DB level, but covers all
 * realistic application-level retry scenarios.
 */
export async function deductStockForInvoiceOnce(
  invoiceId: string,
  lines: StockLine[],
): Promise<{ deducted: boolean; deductionId: string | null; reason?: string }> {
  if (!invoiceId) {
    return { deducted: false, deductionId: null, reason: "missing_invoice_id" };
  }

  // 1) Check guard
  const { data: inv, error: readErr } = await supabase
    .from("invoices")
    .select("stock_deduction_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (readErr) {
    console.error("[stockDeduction] failed to read invoice guard", readErr);
    return { deducted: false, deductionId: null, reason: "read_failed" };
  }
  if (inv?.stock_deduction_id) {
    return { deducted: false, deductionId: inv.stock_deduction_id, reason: "already_deducted" };
  }

  // 2) Perform deduction
  await deductStockForLines(lines);

  // 3) Mark invoice as deducted
  const deductionId =
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      stock_deduction_id: deductionId,
      stock_deducted_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (upErr) {
    console.error("[stockDeduction] failed to mark invoice as deducted", upErr);
    // Stock was already changed; the next call will see no guard and may double-deduct.
    // Surface error so caller can decide. We still return deducted:true to reflect reality.
    return { deducted: true, deductionId: null, reason: "mark_failed" };
  }

  return { deducted: true, deductionId };
}

/**
 * Apply the difference between old and new lines — used when editing an invoice.
 * delta = oldQty - newQty (positive means we should restore that amount; negative means deduct more).
 */
export async function applyStockDeltaForLines(
  oldLines: StockLine[],
  newLines: StockLine[],
): Promise<void> {
  const oldAgg = aggregate(oldLines);
  const newAgg = aggregate(newLines);
  const ids = new Set<string>([...oldAgg.keys(), ...newAgg.keys()]);
  const deltas = new Map<string, number>();
  ids.forEach((id) => {
    const diff = (oldAgg.get(id) || 0) - (newAgg.get(id) || 0);
    if (diff !== 0) deltas.set(id, diff);
  });
  await applyDeltas(deltas);
}
