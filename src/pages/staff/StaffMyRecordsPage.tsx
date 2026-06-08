import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus, ReceiptText, Search, FileText, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

type Tab = "quotes" | "invoices";

// Unified status label + color for the new 3-state quote / 4-state invoice (workflow) model
const STATUS_LABEL: Record<string, string> = {
  // Quotes (4)
  draft: "عرض سعر", sent: "مرسل", accepted: "مقبول", rejected: "مرفوض",
  // Invoices (workflow_status) (4)
  new: "جديد", preparing: "قيد التجهيز", in_transit: "في الطريق للترحيلات", done: "تم",
};
const statusColor = (s: string) => {
  const v = (s || "").toLowerCase();
  if (["accepted", "done"].includes(v)) return "bg-green-500/10 text-green-700 dark:text-green-400";
  if (["sent", "in_transit"].includes(v)) return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
  if (["preparing"].includes(v)) return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (["rejected"].includes(v)) return "bg-red-500/10 text-red-700 dark:text-red-400";
  if (["draft", "new"].includes(v)) return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
  return "bg-primary/10 text-primary";
};
const statusLabel = (s: string) => STATUS_LABEL[(s || "").toLowerCase()] || s || "-";

export default function StaffMyRecordsPage() {
  const { user } = useAuth();
  const { permissions } = useUserRole();
  const canQuotes = permissions.create_quote !== false;
  const canInvoices = permissions.create_invoice !== false;
  const [tab, setTab] = useState<Tab>(canQuotes ? "quotes" : "invoices");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [qr, ir] = await Promise.all([
        canQuotes ? supabase.from("quotes").select("id, quote_number, date, total, status, customers(name)").eq("created_by_uid", user.id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
        canInvoices ? supabase.from("invoices").select("id, invoice_number, date, total, status, workflow_status, customers(name)").eq("created_by_uid", user.id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
      ]);
      setQuotes((qr as any).data || []);
      setInvoices((ir as any).data || []);
      setLoading(false);
    })();
  }, [user, canQuotes, canInvoices]);

  const numKey = tab === "quotes" ? "quote_number" : "invoice_number";
  const baseRows = tab === "quotes" ? quotes : invoices;
  const rows = useMemo(() => {
    if (!q.trim()) return baseRows;
    return baseRows.filter(r =>
      startsWithAny([r[numKey], r.customers?.name, r.status], q)
    );
  }, [baseRows, q, numKey]);

  const fmt = (n: any) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  const totalSum = useMemo(() => rows.reduce((s, r) => s + Number(r.total || 0), 0), [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">سجلاتي</h1>
          <p className="text-sm text-muted-foreground mt-1">عروض الأسعار والفواتير الخاصة بك</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canQuotes && (
            <Link to="/staff/quotes/new" className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-medium hover:opacity-90">
              <FilePlus size={14} /> عرض جديد
            </Link>
          )}
          {canInvoices && (
            <Link to="/staff/invoices/new" className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-medium hover:opacity-90">
              <ReceiptText size={14} /> فاتورة جديدة
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {canQuotes && (
          <button onClick={() => setTab("quotes")}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === "quotes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <FileText size={14} /> عروض الأسعار <span className="text-xs bg-muted px-1.5 rounded">{quotes.length}</span>
          </button>
        )}
        {canInvoices && (
          <button onClick={() => setTab("invoices")}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === "invoices" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Receipt size={14} /> الفواتير <span className="text-xs bg-muted px-1.5 rounded">{invoices.length}</span>
          </button>
        )}
      </div>

      {/* Search + summary */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث برقم، عميل، أو حالة..."
            className="w-full bg-card border border-border rounded-lg pr-10 pl-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="text-sm text-muted-foreground">
          الإجمالي: <span className="font-bold text-foreground">{fmt(totalSum)}</span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الرقم</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">العميل</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الإجمالي</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4].map(i => (
                <tr key={i} className="border-t border-border">
                  <td colSpan={5} className="px-5 py-3"><div className="h-5 bg-muted rounded animate-pulse" /></td>
                </tr>
              ))
            ) : !rows.length ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد سجلات</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-5 py-3 font-medium text-foreground">{r[numKey]}</td>
                <td className="px-5 py-3 text-muted-foreground">{r.customers?.name || "-"}</td>
                <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                <td className="px-5 py-3 font-semibold text-foreground">{fmt(r.total)}</td>
                <td className="px-5 py-3">{(() => { const v = tab === "invoices" ? (r.workflow_status || "new") : (r.status || "draft"); return <span className={`text-xs px-2 py-1 rounded-full ${statusColor(v)}`}>{statusLabel(v)}</span>; })()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />)
        ) : !rows.length ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">لا توجد سجلات</div>
        ) : rows.map(r => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold text-foreground">{r[numKey]}</div>
              {(() => { const v = tab === "invoices" ? (r.workflow_status || "new") : (r.status || "draft"); return <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor(v)}`}>{statusLabel(v)}</span>; })()}
            </div>
            <div className="text-xs text-muted-foreground">{r.customers?.name || "-"}</div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">{r.date}</span>
              <span className="font-bold text-foreground">{fmt(r.total)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
