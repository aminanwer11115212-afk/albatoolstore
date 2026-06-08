import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

interface Props {
  table: "quotes" | "invoices";
  title: string;
  newPath: string;
  numberKey: "quote_number" | "invoice_number";
  createPermission?: "create_quote" | "create_invoice";
}

const STATUS_LABEL: Record<string, string> = {
  draft: "عرض سعر", sent: "مرسل", accepted: "مقبول", rejected: "مرفوض",
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

export default function StaffListPage({ table, title, newPath, numberKey, createPermission }: Props) {
  const { user } = useAuth();
  const { permissions } = useUserRole();
  const canCreate = !createPermission || permissions[createPermission] !== false;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from(table)
        .select("*, customers(name)")
        .eq("created_by_uid", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      setRows(data || []);
      setLoading(false);
    })();
  }, [user, table]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    return rows.filter(r =>
      startsWithAny([r[numberKey], r.customers?.name, r.status], q)
    );
  }, [rows, q, numberKey]);

  const fmt = (n: any) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  const totalSum = useMemo(() => filtered.reduce((s, r) => s + Number(r.total || 0), 0), [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} سجل</p>
        </div>
        {canCreate ? (
          <Link to={newPath} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90">
            <Plus size={16} /> جديد
          </Link>
        ) : (
          <button disabled title="ليس لديك صلاحية الإنشاء" className="flex items-center gap-2 bg-muted text-muted-foreground px-4 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed">
            <Plus size={16} /> جديد
          </button>
        )}
      </div>

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

      {/* Desktop */}
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
              [1,2,3,4].map(i => <tr key={i} className="border-t border-border"><td colSpan={5} className="px-5 py-3"><div className="h-5 bg-muted rounded animate-pulse" /></td></tr>)
            ) : !filtered.length ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">{q ? "لا نتائج للبحث" : "لا توجد سجلات"}</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-5 py-3 font-medium text-foreground">{r[numberKey]}</td>
                <td className="px-5 py-3 text-muted-foreground">{r.customers?.name || "-"}</td>
                <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                <td className="px-5 py-3 font-semibold text-foreground">{fmt(r.total)}</td>
                <td className="px-5 py-3">{(() => { const v = table === "invoices" ? (r.workflow_status || "new") : (r.status || "draft"); return <span className={`text-xs px-2 py-1 rounded-full ${statusColor(v)}`}>{statusLabel(v)}</span>; })()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />)
        ) : !filtered.length ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">{q ? "لا نتائج" : "لا توجد سجلات"}</div>
        ) : filtered.map(r => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold text-foreground">{r[numberKey]}</div>
              {(() => { const v = table === "invoices" ? (r.workflow_status || "new") : (r.status || "draft"); return <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor(v)}`}>{statusLabel(v)}</span>; })()}
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
