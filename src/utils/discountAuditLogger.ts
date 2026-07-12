/**
 * Discount audit logger.
 *
 * Records every discount change (invoice / payment / purchase) with:
 *   before/after discount, before/after total, before/after net balance
 * so the /reports/discount-audit page and the customer/supplier tabs
 * can explain exactly how each discount affected "له / عليه".
 *
 * NEVER logs when discount_added == 0.
 */
import { supabase } from "@/integrations/supabase/client";

export type DiscountAuditSource =
  | "customer_payment_dialog"
  | "supplier_payment_dialog"
  | "invoice_edit"
  | "quote_edit"
  | "purchase_edit"
  | "other";

export type DiscountAuditEntity = "invoice" | "payment" | "purchase_order" | "quote";

export interface DiscountAuditPayload {
  entity_type: DiscountAuditEntity;
  entity_id?: string | null;
  entity_number?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  discount_before: number;
  discount_added: number;
  discount_after: number;
  total_before: number;
  total_after: number;
  balance_before?: number | null;
  balance_after?: number | null;
  source: DiscountAuditSource;
  note?: string | null;
}

export function buildDiscountAuditPayload(input: DiscountAuditPayload) {
  const round = (n: number | null | undefined) =>
    n === null || n === undefined || Number.isNaN(Number(n)) ? null : Number(Number(n).toFixed(4));
  return {
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    entity_number: input.entity_number ?? null,
    customer_id: input.customer_id ?? null,
    supplier_id: input.supplier_id ?? null,
    discount_before: round(input.discount_before) ?? 0,
    discount_added: round(input.discount_added) ?? 0,
    discount_after: round(input.discount_after) ?? 0,
    total_before: round(input.total_before) ?? 0,
    total_after: round(input.total_after) ?? 0,
    balance_before: round(input.balance_before),
    balance_after: round(input.balance_after),
    source: input.source,
    note: input.note ?? null,
  };
}

export async function logDiscountEvent(input: DiscountAuditPayload): Promise<void> {
  if (!input || !input.discount_added || Math.abs(input.discount_added) < 0.0001) return;
  try {
    const payload = buildDiscountAuditPayload(input);
    let created_by: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      created_by = data?.user?.id ?? null;
    } catch {}
    await (supabase as any)
      .from("discount_audit_log")
      .insert({ ...payload, created_by });
  } catch (e) {
    // never break the UX because of an audit failure
    if (typeof window !== "undefined") {
      console.warn("[discountAuditLogger] failed to persist", e);
    }
  }
}
