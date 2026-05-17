import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus, ReceiptText, FileText, Receipt, UserPlus, ClipboardList, TrendingUp, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export default function StaffDashboard() {
  const { user } = useAuth();
  const { permissions, role } = useUserRole();
  const [stats, setStats] = useState({ quotes: 0, invoices: 0, today: 0, totalSales: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const today = new Date(); today.setHours(0,0,0,0);
      const [q, i, t, sales, recentInv] = await Promise.all([
        supabase.from("quotes").select("id", { count: "exact", head: true }).eq("created_by_uid", user.id),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("created_by_uid", user.id),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("created_by_uid", user.id).gte("created_at", today.toISOString()),
        supabase.from("invoices").select("total").eq("created_by_uid", user.id),
        supabase.from("invoices").select("id, invoice_number, total, date, status, customers(name)").eq("created_by_uid", user.id).order("created_at", { ascending: false }).limit(5),
      ]);
      const totalSales = (sales.data || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      setStats({ quotes: q.count || 0, invoices: i.count || 0, today: t.count || 0, totalSales });
      setRecent(recentInv.data || []);
      setLoading(false);
    })();
  }, [user]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });

  const cards = [
    { label: "عروض أسعاري", value: stats.quotes, icon: FileText, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { label: "فواتيري", value: stats.invoices, icon: Receipt, color: "bg-green-500/10 text-green-600 dark:text-green-400" },
    { label: "فواتير اليوم", value: stats.today, icon: Calendar, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { label: "إجمالي مبيعاتي", value: fmt(stats.totalSales), icon: TrendingUp, color: "bg-primary/10 text-primary" },
  ];

  const actions = [
    { to: "/staff/quotes/new", label: "عرض سعر جديد", icon: FilePlus, show: permissions.create_quote !== false },
    { to: "/staff/invoices/new", label: "فاتورة جديدة", icon: ReceiptText, show: permissions.create_invoice !== false },
    { to: "/staff/customers", label: "عميل جديد", icon: UserPlus, show: permissions.add_customer !== false },
    { to: "/staff/my-records", label: "سجلاتي", icon: ClipboardList, show: permissions.create_quote !== false || permissions.create_invoice !== false },
  ].filter(a => a.show);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "صباح الخير";
    if (h < 18) return "مساء الخير";
    return "مساء الخير";
  })();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">{greeting} 👋</h1>
        <p className="text-muted-foreground mt-1 text-sm">إليك ملخص نشاطك</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-card rounded-xl p-4 md:p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 md:w-11 md:h-11 rounded-lg flex items-center justify-center mb-3 ${c.color}`}>
                <Icon size={20} />
              </div>
              <div className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground break-all">
                {loading ? <span className="inline-block w-12 h-6 bg-muted rounded animate-pulse" /> : c.value}
              </div>
              <div className="text-xs md:text-sm text-muted-foreground mt-1">{c.label}</div>
            </div>
          );
        })}
      </div>

      {actions.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">إجراءات سريعة</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {actions.map(a => {
              const Icon = a.icon;
              return (
                <Link key={a.to} to={a.to}
                  className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary hover:shadow-md transition-all group">
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-lg bg-primary text-primary-foreground flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Icon size={18} />
                  </div>
                  <div className="font-medium text-xs md:text-sm text-foreground">{a.label}</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent invoices */}
      {(permissions.create_invoice !== false) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">آخر فواتيري</h2>
            <Link to="/staff/my-records" className="text-xs text-primary hover:underline">عرض الكل ←</Link>
          </div>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {loading ? (
              <div className="p-8 space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : !recent.length ? (
              <div className="p-10 text-center text-muted-foreground text-sm">لا توجد فواتير بعد</div>
            ) : (
              <div className="divide-y divide-border">
                {recent.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-4 md:px-5 py-3 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground text-sm">{r.invoice_number}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.customers?.name || "-"} • {r.date}</div>
                    </div>
                    <div className="text-sm font-semibold text-foreground whitespace-nowrap">{fmt(r.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
