import { supabase } from "@/integrations/supabase/client";

/**
 * Stock receive policy for Purchase Orders:
 * - Stock is INCREASED only when a Purchase Order transitions into "completed".
 * - Idempotency: we read the CURRENT persisted status from DB before adding.
 *   If it is already "completed", we skip (prevents double-add on retries,
 *   refresh, or repeated status changes).
 * - When editing items of an already-completed purchase, only the delta
 *   between old and new lines is applied.
 */

export type StockLine = { product_id: string | null | undefined; quantity: number | null | undefined };

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

async function applyDeltas(deltas: Map<string, number>): Promise<void> {
  const entries = Array.from(deltas.entries()).filter(([, d]) => d !== 0);
  if (!entries.length) return;

  const ids = entries.map(([id]) => id);
  const { data: products, error } = await supabase
    .from("products")
    .select("id, stock_quantity")
    .in("id", ids);
  if (error) throw new Error(`فشل قراءة المخزون الحالي: ${error.message}`);

  const current = new Map<string, number>();
  (products || []).forEach((p: any) => current.set(p.id, Number(p.stock_quantity || 0)));

  const results = await Promise.all(
    entries.map(async ([id, delta]) => {
      const newQty = (current.get(id) || 0) + delta;
      const { error: upErr } = await supabase
        .from("products")
        .update({ stock_quantity: newQty })
        .eq("id", id);
      return { id, error: upErr?.message || null };
    }),
  );

  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("products:changed")); } catch {}
  }

  const failures = results.filter((r) => r.error);
  if (failures.length) {
    throw new Error(`فشل تحديث المخزون لـ ${failures.length} منتج`);
  }
}

/** Increase stock by the given lines (no guard). */
export async function addStockForLines(lines: StockLine[]): Promise<void> {
  const agg = aggregate(lines);
  const deltas = new Map<string, number>();
  agg.forEach((qty, id) => deltas.set(id, qty));
  await applyDeltas(deltas);
}

/** Read currently persisted status of a purchase order. */
export async function getPurchaseStatus(purchaseId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("purchase_orders")
    .select("status")
    .eq("id", purchaseId)
    .maybeSingle();
  return (data?.status as string) || null;
}

/**
 * Idempotent stock add for a purchase order, guarded by current persisted status.
 * Only adds if the DB currently shows status !== "completed".
 */
export async function receiveStockForPurchaseOnce(
  purchaseId: string,
  lines: StockLine[],
): Promise<{ added: boolean; reason?: string }> {
  if (!purchaseId) return { added: false, reason: "missing_purchase_id" };
  const currentStatus = await getPurchaseStatus(purchaseId);
  if (currentStatus === "completed") return { added: false, reason: "already_completed" };
  await addStockForLines(lines);
  return { added: true };
}

/**
 * Apply delta when editing a purchase order whose stock was already received.
 * delta = newQty - oldQty (positive => add more to stock, negative => remove).
 */
export async function applyStockDeltaForPurchaseLines(
  oldLines: StockLine[],
  newLines: StockLine[],
): Promise<void> {
  const oldAgg = aggregate(oldLines);
  const newAgg = aggregate(newLines);
  const ids = new Set<string>([...oldAgg.keys(), ...newAgg.keys()]);
  const deltas = new Map<string, number>();
  ids.forEach((id) => {
    const diff = (newAgg.get(id) || 0) - (oldAgg.get(id) || 0);
    if (diff !== 0) deltas.set(id, diff);
  });
  await applyDeltas(deltas);
}
