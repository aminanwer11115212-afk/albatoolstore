import { supabase } from "@/integrations/supabase/client";

/**
 * Record a revision (audit log entry) for an invoice.
 * Stores a JSON snapshot of "before" + the diff of changes.
 */
export async function recordInvoiceRevision(opts: {
  invoiceId: string;
  action: "create" | "update" | "delete" | "status_change" | "payment" | "convert" | "workflow_status_change";
  changedBy?: string | null;
  changes?: Record<string, { before: any; after: any }>;
  snapshot?: Record<string, any>;
  note?: string;
}) {
  try {
    // Get next revision number for this invoice
    const { data: existing } = await supabase
      .from("invoice_revisions" as any)
      .select("revision_number")
      .eq("invoice_id", opts.invoiceId)
      .order("revision_number", { ascending: false })
      .limit(1);

    const nextNumber = ((existing as any[])?.[0]?.revision_number || 0) + 1;

    await (supabase as any).from("invoice_revisions").insert({
      invoice_id: opts.invoiceId,
      revision_number: nextNumber,
      action: opts.action,
      changed_by: opts.changedBy || null,
      changes: opts.changes || null,
      snapshot: opts.snapshot || null,
      note: opts.note || null,
    });
  } catch (e) {
    console.error("Failed to record invoice revision", e);
  }
}

/**
 * Compute a diff object between two row states.
 */
export function diffRows(before: Record<string, any>, after: Record<string, any>): Record<string, { before: any; after: any }> {
  const diff: Record<string, { before: any; after: any }> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (k === "updated_at" || k === "created_at") continue;
    const b = before?.[k];
    const a = after?.[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[k] = { before: b, after: a };
    }
  }
  return diff;
}
