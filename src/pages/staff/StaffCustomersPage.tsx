import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

export default function StaffCustomersPage() {
  const { permissions } = useUserRole();
  const canAdd = permissions.add_customer !== false;
  const canView = permissions.view_customers !== false;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(500);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [canView]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      String(r.name || "").toLowerCase().includes(s) ||
      String(r.phone || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  if (!canView && !canAdd) {
    return (
      <div className="bg-card rounded-xl p-10 text-center border border-border">
        <h1 className="text-xl font-bold text-foreground mb-2">العملاء</h1>
        <p className="text-muted-foreground">ليس لديك صلاحية الوصول إلى هذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">العملاء</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} عميل</p>
        </div>
        {canAdd && (
          <button onClick={() => setDialogOpen(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90">
            <Plus size={16} /> عميل جديد
          </button>
        )}
      </div>

      <CustomerFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); load(); }}
      />

      {canView && (
        <div className="relative max-w-md">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم، الهاتف..."
            className="w-full bg-card border border-border rounded-lg pr-10 pl-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" />
        </div>
      )}

      {canView ? (
        <>
          {/* Desktop table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الاسم</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الهاتف</th>
                
                
              </tr></thead>
              <tbody>
                {loading ? (
                  [1,2,3].map(i => <tr key={i} className="border-t border-border"><td colSpan={2} className="px-5 py-3"><div className="h-5 bg-muted rounded animate-pulse" /></td></tr>)
                ) : !filtered.length ? (
                  <tr><td colSpan={2} className="text-center py-10 text-muted-foreground">{q ? "لا نتائج للبحث" : "لا يوجد عملاء"}</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                    <td className="px-5 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-5 py-3 text-muted-foreground" dir="ltr">{r.phone || "-"}</td>
                    
                    
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {loading ? (
              [1,2,3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />)
            ) : !filtered.length ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">{q ? "لا نتائج للبحث" : "لا يوجد عملاء"}</div>
            ) : filtered.map(r => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="font-bold text-foreground">{r.name}</div>
                
                {r.phone && <div className="flex items-center gap-2 text-xs text-muted-foreground" dir="ltr"><Phone size={12} />{r.phone}</div>}
                
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-card rounded-xl p-8 text-center border border-border text-muted-foreground text-sm">
          ليس لديك صلاحية عرض قائمة العملاء. يمكنك فقط إضافة عملاء جدد.
        </div>
      )}
    </div>
  );
}
