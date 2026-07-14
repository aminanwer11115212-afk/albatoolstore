import { supabase } from "@/integrations/supabase/client";
import { runOrQueue } from "@/lib/offlineQueue";

/**
 * Mark a quote (or side quote) as "sent" if it is currently a draft.
 * - Only transitions draft → sent.
 * - Never overwrites accepted/rejected.
 * - Silent on failure (UI must not break if this fails).
 */
export async function markQuoteAsSent(quoteId: string | undefined | null): Promise<void> {
  if (!quoteId) return;
  try {
    const { data, error } = await supabase
      .from("quotes")
      .select("status")
      .eq("id", quoteId)
      .maybeSingle();
    if (error || !data) return;
    const current = String((data as any).status || "draft");
    if (current !== "draft") return;
    await runOrQueue({ table: "quotes", op: "update", payload: { status: "sent" }, match: { id: quoteId }, label: "تحديث حالة عرض السعر إلى مُرسل" });
  } catch (e) {
    console.warn("[markQuoteAsSent] failed", e);
  }
}
