import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download, ShieldCheck, RefreshCw, Undo2, Trash2, ArrowRightLeft } from "lucide-react";

type Row = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  user_email: string | null;
  user_name: string | null;
  created_at: string;
  details: any;
  old_data: any;
};

type Kind = "all" | "converted_payments" | "reverse_charge" | "delete";

/**
 * Per-customer audit log tab. Reads from `activity_log` and shows only rows
 * relevant to that customer (via entity_id or details.customer_id / invoices).
 * Filters:
 *   - نوع العملية: تحويل إلى رصيد دائن / إلغاء شحنة / حذف فاتورة
 *   - بحث السبب (reason) في details
 *   - نطاق تاريخ (من/إلى)
 */
export default function CustomerAuditLog({ customerId }: { customerId: string }) {
  const [kind, setKind] = useState<Kind>("all");
  const [reasonQ, setReasonQ] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["customer-audit-log", customerId],
    queryFn: async () => {
      // Fetch invoice ids for this customer to correlate invoice-delete rows.
      const [{ data: invs }, { data: byEntity }] = await Promise.all([
        supabase.from("invoices").select("id").eq("customer_id", customerId),
        supabase
          .from("activity_log" as any)
          .select("id, entity_type, entity_id, action, user_email, user_name, created_at, details, old_data")
          .eq("entity_type", "customer_charge")
          .eq("entity_id", customerId)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      const invIds = new Set((invs || []).map((r: any) => r.id));

      let byInvoice: any[] = [];
      if (invIds.size) {
        const { data: rows } = await supabase
          .from("activity_log" as any)
          .select("id, entity_type, entity_id, action, user_email, user_name, created_at, details, old_data")
          .eq("entity_type", "invoice")
          .in("entity_id", Array.from(invIds))
          .order("created_at", { ascending: false })
          .limit(500);
        byInvoice = rows || [];
      }
      return [...(byEntity || []), ...byInvoice] as Row[];
    },
  });

  const filtered = useMemo(() => {
    const rows = (data || []).filter((r) => {
      if (fromDate && r.created_at < fromDate) return false;
      if (toDate && r.created_at > toDate + "T23:59:59") return false;
      if (kind === "converted_payments") {
        if (!(r.action === "delete" && Number(r.details?.converted_to_credit || 0) > 0.01)) return false;
      } else if (kind === "reverse_charge") {
        if (r.action !== "reverse_charge") return false;
      } else if (kind === "delete") {
        if (r.action !== "delete") return false;
      }
      if (reasonQ.trim()) {
        const hay = JSON.stringify(r.details || {}).toLowerCase();
        if (!hay.includes(reasonQ.trim().toLowerCase())) return false;
      }
      return true;
    });
    return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [data, kind, reasonQ, fromDate, toDate]);

  const exportCsv = () => {
    const headers = ["at", "action", "entity_type", "user", "invoice_number", "group_id", "converted_to_credit", "reason", "details_json"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(",")];
    for (const r of filtered) {
      const d = r.details || {};
      const invNo = d.converted_payments?.invoice_number || r.old_data?.invoice_number || "";
      const reason = d.reason || d.converted_payments?.reason || "";
      lines.push([
        r.created_at,
        r.action,
        r.entity_type,
        r.user_email || r.user_name || "",
        invNo,
        d.group_id || "",
        d.converted_to_credit || d.converted_payments?.amount || "",
        reason,
        JSON.stringify(d),
      ].map(esc).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-audit-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const iconFor = (r: Row) => {
    if (r.action === "reverse_charge") return <Undo2 size={14} className="text-destructive" />;
    if (r.action === "delete" && Number(r.details?.converted_to_credit || 0) > 0.01)
      return <ArrowRightLeft size={14} className="text-primary" />;
    if (r.action === "delete") return <Trash2 size={14} className="text-destructive" />;
    return <ShieldCheck size={14} className="text-muted-foreground" />;
  };

  const labelFor = (r: Row) => {
    if (r.action === "reverse_charge") return "إلغاء شحنة رصيد";
    if (r.action === "delete" && Number(r.details?.converted_to_credit || 0) > 0.01)
      return "حذف فاتورة → تحويل إلى رصيد دائن";
    if (r.action === "delete") return "حذف فاتورة";
    return r.action;
  };

  const fmt = (n: any) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (isLoading) {
    return (
      <div className="p-3 space-y-3" data-testid="audit-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">نوع العملية</label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العمليات</SelectItem>
              <SelectItem value="converted_payments">تحويل دفعات إلى رصيد دائن</SelectItem>
              <SelectItem value="reverse_charge">إلغاء شحنة رصيد</SelectItem>
              <SelectItem value="delete">حذف فاتورة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">من تاريخ</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">إلى تاريخ</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground">بحث في السبب / التفاصيل</label>
          <Input value={reasonQ} onChange={(e) => setReasonQ(e.target.value)} placeholder="مثال: manual_reverse" className="h-9" />
        </div>
        <div className="mr-auto flex items-center gap-2">
          <div className="text-sm text-muted-foreground">النتائج: <span className="font-bold text-foreground">{filtered.length}</span></div>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={`ml-1 ${isFetching ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length} data-testid="export-audit-csv">
            <Download size={14} className="ml-1" /> تصدير CSV
          </Button>
        </div>
      </div>

      {!filtered.length ? (
        <div className="p-8 text-center text-muted-foreground text-sm" data-testid="audit-empty">
          لا توجد عمليات مسجّلة تطابق هذه الفلاتر.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-xs text-muted-foreground">
                <th className="text-right px-3 py-2 font-semibold">التاريخ</th>
                <th className="text-right px-3 py-2 font-semibold">العملية</th>
                <th className="text-right px-3 py-2 font-semibold">المستخدم</th>
                <th className="text-right px-3 py-2 font-semibold">فاتورة / مجموعة</th>
                <th className="text-right px-3 py-2 font-semibold">المبلغ</th>
                <th className="text-right px-3 py-2 font-semibold">السبب</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const d = r.details || {};
                const invNo = d.converted_payments?.invoice_number || r.old_data?.invoice_number;
                const amount = d.converted_payments?.amount ?? d.converted_to_credit ?? d.total;
                const reason = d.reason || d.converted_payments?.reason || "—";
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {iconFor(r)} {labelFor(r)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.user_email || r.user_name || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {invNo && <div className="font-bold">فاتورة: {invNo}</div>}
                      {d.group_id && <div className="text-muted-foreground">group: {String(d.group_id).slice(0, 8)}…</div>}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-bold">
                      {amount != null ? fmt(amount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
