import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DeletedInvoiceEntry = {
  id: string;                 // activity_log row id
  invoice_id: string | null;
  invoice_number: string | null;
  date: string | null;
  deleted_at: string;
  total: number;
  paid_amount: number;
  deleted_payments: number;
  restored_stock: boolean;
  items_count: number;
  status: string | null;
  workflow_status: string | null;
  user_email: string | null;
};

/**
 * Reads the tombstone rows written by `deleteInvoiceWithStockRestore`
 * into `activity_log` (entity_type='invoice', action='delete').
 * Filtered to a customer + optional date range so the statement page
 * can show deleted invoices inline as read-only rows.
 */
export function useDeletedInvoicesForCustomer(customerId: string | null | undefined, fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: ["activity-log", "invoice-deletions", customerId || null, fromDate || "", toDate || ""],
    enabled: !!customerId,
    queryFn: async (): Promise<DeletedInvoiceEntry[]> => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("activity_log" as any)
        .select("id, entity_id, old_data, details, created_at, user_email")
        .eq("entity_type", "invoice")
        .eq("action", "delete")
        .eq("old_data->>customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data || []).map((r: any) => {
        const od = r.old_data || {};
        const det = r.details || {};
        return {
          id: r.id,
          invoice_id: r.entity_id ?? null,
          invoice_number: od.invoice_number ?? null,
          date: od.date ?? null,
          deleted_at: r.created_at,
          total: Number(od.total || 0),
          paid_amount: Number(od.paid_amount || 0),
          deleted_payments: Number(det.deleted_payments || 0),
          restored_stock: !!det.restored_stock,
          items_count: Number(det.items_count || 0),
          status: od.status ?? null,
          workflow_status: od.workflow_status ?? null,
          user_email: r.user_email ?? null,
        } as DeletedInvoiceEntry;
      });
      return rows.filter((r) => {
        const d = r.date;
        if (fromDate && d && d < fromDate) return false;
        if (toDate && d && d > toDate) return false;
        return true;
      });
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
