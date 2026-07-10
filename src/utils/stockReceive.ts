import { supabase } from "@/integrations/supabase/client";

/**
 * Stock receive policy for Purchase Orders:
 * - Stock is INCREASED only when a Purchase Order transitions into "received".
 * - Idempotency: we read the CURRENT persisted status from DB before adding.
 *   If it is already "received", we skip (prevents double-add on retries,
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

  // تحديث ذرّي عبر RPC على قاعدة البيانات لمنع race condition.
  const failures: Array<{ id: string; error: string }> = [];
  await Promise.all(
    entries.map(async ([id, delta]) => {
      const { error } = await (supabase as any).rpc("apply_stock_delta", {
        _product_id: id,
        _delta: delta,
      });
      if (error) failures.push({ id, error: error.message });
    }),
  );


  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new Event("products:changed")); } catch {}
  }

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
 * Only adds if the DB currently shows status !== "received".
 */
export async function receiveStockForPurchaseOnce(
  purchaseId: string,
  lines: StockLine[],
): Promise<{ added: boolean; reason?: string }> {
  if (!purchaseId) return { added: false, reason: "missing_purchase_id" };
  // الحارس الأساسي: RPC ذرّي على مستوى DB يقفل الصف ويمنع التطبيق المضاعف حتى عند التزامن من جهازين.
  const { data, error } = await (supabase as any).rpc("receive_purchase_stock_once", {
    _po_id: purchaseId,
  });
  if (!error && data) {
    if (typeof window !== "undefined") {
      try { window.dispatchEvent(new Event("products:changed")); } catch {}
    }
    if (data.ok) return { added: true };
    return { added: false, reason: data.reason };
  }
  // Fallback (نسخة قديمة من DB بدون RPC): السلوك القديم مع فحص الحالة
  const currentStatus = await getPurchaseStatus(purchaseId);
  if (currentStatus === "received") return { added: false, reason: "already_completed" };
  await addStockForLines(lines);
  return { added: true };
}

/**
 * Idempotent stock RESTORE (subtract) for a purchase order being cancelled/deleted.
 *
 * Reservation-first pattern (same as invoice deletion):
 *   1. Read current status.
 *   2. If not "received" → nothing to restore.
 *   3. Atomically flip status "received" → "cancelled" (WHERE status='received').
 *      Only one caller wins that predicate. Losers short-circuit.
 *   4. Winner subtracts stock. If subtraction fails, status is already 'cancelled'
 *      so retries won't double-subtract; caller can surface the failure and re-add
 *      manually. Under-restore is safer than double-restore.
 */
export async function restoreStockForPurchaseOnce(
  purchaseId: string,
  lines: StockLine[],
): Promise<{ restored: boolean; reason?: string }> {
  if (!purchaseId) return { restored: false, reason: "missing_purchase_id" };

  // الحارس الأساسي: RPC ذرّي على مستوى DB — يقفل الصف ويمنع الخصم المضاعف.
  const { data, error } = await (supabase as any).rpc("restore_purchase_stock_once", {
    _po_id: purchaseId,
  });
  if (!error && data) {
    if (typeof window !== "undefined") {
      try { window.dispatchEvent(new Event("products:changed")); } catch {}
    }
    if (data.ok) return { restored: true };
    if (data.reason === "not_applied") return { restored: false, reason: "not_received" };
    return { restored: false, reason: data.reason };
  }

  // Fallback (نسخة قديمة من DB): flip-status ثم خصم يدوي
  const currentStatus = await getPurchaseStatus(purchaseId);
  if (currentStatus !== "received") return { restored: false, reason: "not_received" };
  const { data: flipped, error: flipErr } = await (supabase as any)
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", purchaseId)
    .eq("status", "received")
    .select("id");
  if (flipErr) throw new Error(`تعذّر تحديث حالة الأمر: ${flipErr.message}`);
  if (!Array.isArray(flipped) || flipped.length === 0) {
    return { restored: false, reason: "already_cancelled" };
  }
  const agg = aggregate(lines);
  const deltas = new Map<string, number>();
  agg.forEach((qty, id) => deltas.set(id, -qty));
  await applyDeltas(deltas);
  return { restored: true };
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
