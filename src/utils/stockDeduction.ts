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

  // تحديث ذرّي عبر RPC على قاعدة البيانات (UPDATE ... SET qty = qty + delta)
  // لمنع race condition بين الجلسات المتوازية.
  const failures: Array<{ id: string; error: string }> = [];
  await Promise.all(
    entries.map(async ([id, delta]) => {
      const { error } = await (supabase as any).rpc("apply_stock_delta", {
        _product_id: id,
        _delta: delta,
      });
      if (error) {
        console.error("[stockDeduction] rpc apply_stock_delta failed for", id, error);
        failures.push({ id, error: error.message });
      }
    }),
  );


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
 * Idempotent stock deduction for an invoice — RESERVATION-FIRST pattern.
 *
 * Uses `invoices.stock_deduction_id` as a guard, but writes it BEFORE the
 * stock is decremented. Sequence:
 *
 *   1. Read guard. Already set  → skip (return already_deducted).
 *   2. Conditional UPDATE:
 *        SET stock_deduction_id = <new uuid>
 *        WHERE id = X AND stock_deduction_id IS NULL
 *        RETURNING stock_deduction_id
 *      This is atomic at the row level in Postgres — only one caller wins.
 *      If 0 rows returned → someone else won the race → re-read + skip.
 *   3. Winner deducts stock. If deduction fails the guard is ALREADY set,
 *      so retries cannot double-deduct (they short-circuit at step 1).
 *   4. Best-effort: write `stock_deducted_at` for observability.
 *
 * Trade-off: if step 3 fails, stock is UNDER-deducted (never over). This is
 * the safe direction — retrying via a manual "re-deduct" path is preferable
 * to silently deducting twice.
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

  // 2) Reserve the deduction slot atomically (row-level UPDATE with predicate).
  const deductionId =
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const { data: reserved, error: reserveErr } = await (supabase as any)
    .from("invoices")
    .update({ stock_deduction_id: deductionId })
    .eq("id", invoiceId)
    .is("stock_deduction_id", null)
    .select("stock_deduction_id");

  if (reserveErr) {
    console.error("[stockDeduction] reservation UPDATE failed", reserveErr);
    return { deducted: false, deductionId: null, reason: "reserve_failed" };
  }

  const wonReservation = Array.isArray(reserved) && reserved.length > 0;
  if (!wonReservation) {
    // Another caller reserved between our read and our write. Re-fetch the id.
    const { data: after } = await supabase
      .from("invoices")
      .select("stock_deduction_id")
      .eq("id", invoiceId)
      .maybeSingle();
    return {
      deducted: false,
      deductionId: after?.stock_deduction_id ?? null,
      reason: "already_deducted",
    };
  }

  // 3) We own the reservation — deduct stock. Any failure here leaves the
  //    guard set, so a retry will short-circuit at step 1 and NEVER
  //    re-deduct. This is the safety guarantee.
  try {
    await deductStockForLines(lines);
  } catch (e) {
    console.error("[stockDeduction] deduction failed after reservation", e);
    return { deducted: false, deductionId, reason: "deduction_failed" };
  }

  // 4) Best-effort: mark deducted_at timestamp for reporting/observability.
  const { error: tsErr } = await supabase
    .from("invoices")
    .update({ stock_deducted_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (tsErr) {
    console.warn("[stockDeduction] stock_deducted_at write failed (non-critical)", tsErr);
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
