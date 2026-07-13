import { useMemo, useState, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import type { StatementData } from "@/utils/statementPrintTemplate";
import { netBalanceOf } from "@/utils/balanceDisplay";
import { toast } from "sonner";
import {
  FileText, RotateCcw, Receipt, Wallet, AlertTriangle, CheckCircle2,
  ArrowLeft, Pencil, Trash2, Phone, MapPin, Home, StickyNote,
  ExternalLink, ClipboardList, User, Share2
} from "lucide-react";
import { exportContactToDevice } from "@/utils/exportContact";


interface Props {
  customer: any;
  onBack: () => void;
  onEdit: (c: any) => void;
  onDelete: (id: string) => void;
}

type TabKey = "invoices" | "quotes" | "returns";

export default function CustomerDetailView({ customer, onBack, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<TabKey>("invoices");
  const navigate = useNavigate();

  const { data: invoices = [], isLoading: loadingInv } = useQuery({
    queryKey: ["customer-invoices", customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, date, total, paid_amount, status, workflow_status, type, currency_code")
        .eq("customer_id", customer.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: returns = [], isLoading: loadingRet } = useQuery({
    queryKey: ["customer-returns", customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_returns")
        .select("id, return_number, total, status, created_at, date")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: quotes = [], isLoading: loadingQt } = useQuery({
    queryKey: ["customer-quotes", customer.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, date, total, status")
        .eq("customer_id", customer.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const totalSales = invoices.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
    const totalPaid = invoices.reduce((s: number, i: any) => s + Number(i.paid_amount || 0), 0);
    const totalDue = invoices.reduce((s: number, i: any) => s + (Number(i.total || 0) - Number(i.paid_amount || 0)), 0);
    const unpaidCount = invoices.filter((i: any) => Number(i.total || 0) - Number(i.paid_amount || 0) > 0.01).length;
    const totalReturns = returns.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    return {
      totalSales, totalPaid, totalDue, unpaidCount,
      invoicesCount: invoices.length,
      returnsCount: returns.length,
      totalReturns,
      quotesCount: quotes.length,
    };
  }, [invoices, returns, quotes]);

  const fmt = (n: number) => Number(n || 0).toLocaleString();
  const initials = (customer.name || "?").trim().split(/\s+/).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header / Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary))_0,transparent_60%)]" />
        <div className="relative p-6 flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold shadow-md">
              {initials || <User size={24} />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                
                {customer.city && <span className="flex items-center gap-1"><MapPin size={14} />{customer.city}</span>}
                {customer.phone && <span className="flex items-center gap-1"><Phone size={14} />{customer.phone}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={onBack} className="bg-card border border-border text-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-muted">
              <ArrowLeft size={16} /> رجوع
            </button>
            <button
              onClick={async () => {
                const { data: companyRow } = await supabase
                  .from("company_settings")
                  .select("company_name, phone, address, email, logo_url, currency")
                  .maybeSingle();
                const payload: StatementData = {
                  kind: "customer",
                  party: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address || customer.city,
                    email: customer.email,
                    balance: netBalanceOf(customer as any),
                  },
                  company: (companyRow as any) || undefined,
                  invoices: invoices.map((inv: any) => ({
                    invoice_number: inv.invoice_number,
                    date: inv.date,
                    total: Number(inv.total || 0),
                    paid_amount: Number(inv.paid_amount || 0),
                    status: inv.status,
                  })),
                  totals: {
                    invoicesTotal: stats.totalSales,
                    paidTotal: stats.totalPaid,
                    remaining: stats.totalDue,
                  },
                };
                sessionStorage.setItem("lov_statement_preview", JSON.stringify(payload));
                navigate("/reports/statement-preview");
              }}
              className="bg-card border border-border text-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-muted"
            >
              <ClipboardList size={16} /> كشف حساب
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await exportContactToDevice({
                    name: customer.name,
                    phone: customer.phone,
                    whatsapp: customer.whatsapp,
                    email: customer.email,
                    address: customer.address,
                    city: customer.city,
                    notes: customer.notes,
                  });
                  toast.success(res === "shared" ? "تمت مشاركة بطاقة العميل" : "تم تنزيل بطاقة العميل (.vcf)");
                } catch (e: any) {
                  toast.error(e?.message || "تعذّر تصدير جهة الاتصال");
                }
              }}
              className="bg-card border border-border text-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-muted"
              title="تصدير كبطاقة جهة اتصال (.vcf) — تُفتح مباشرة على الهاتف"
            >
              <Share2 size={16} /> تصدير للجهات
            </button>
            <button onClick={() => onEdit(customer)} className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:opacity-90">
              <Pencil size={16} /> تعديل
            </button>
            <button onClick={() => onDelete(customer.id)} className="bg-destructive text-destructive-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:opacity-90">
              <Trash2 size={16} /> حذف
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 px-6 pb-6">
          <StatCard icon={<FileText size={18} />} label="الفواتير" value={stats.invoicesCount} tone="primary" />
          <StatCard icon={<Receipt size={18} />} label="إجمالي المبيعات" value={fmt(stats.totalSales)} tone="primary" />
          <StatCard icon={<CheckCircle2 size={18} />} label="المدفوع" value={fmt(stats.totalPaid)} tone="success" />
          <StatCard icon={<Wallet size={18} />} label="المستحق" value={fmt(stats.totalDue)} tone="danger" />
          <StatCard icon={<AlertTriangle size={18} />} label="غير مسددة" value={stats.unpaidCount} tone="warning" />
          <StatCard icon={<RotateCcw size={18} />} label="المرتجعات" value={`${stats.returnsCount} (${fmt(stats.totalReturns)})`} tone="muted" />
        </div>
      </div>

      {/* Customer Info card */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><User size={16} /> بيانات العميل</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <InfoRow icon={<Phone size={14} />} label="الهاتف" value={customer.phone} />
          
          
          <InfoRow icon={<MapPin size={14} />} label="المدينة" value={customer.city} />
          <InfoRow icon={<Home size={14} />} label="العنوان" value={customer.address} />
          <InfoRow icon={<StickyNote size={14} />} label="ملاحظات" value={customer.notes} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex border-b border-border bg-muted/30">
          <TabBtn active={tab === "invoices"} onClick={() => setTab("invoices")} icon={<FileText size={15} />} label="الفواتير" count={invoices.length} />
          <TabBtn active={tab === "quotes"} onClick={() => setTab("quotes")} icon={<Receipt size={15} />} label="عروض الأسعار" count={quotes.length} />
          <TabBtn active={tab === "returns"} onClick={() => setTab("returns")} icon={<RotateCcw size={15} />} label="المرتجعات" count={returns.length} />
        </div>

        {tab === "invoices" && (
          <DataTable
            loading={loadingInv}
            empty="لا توجد فواتير"
            cols={["رقم", "التاريخ", "الإجمالي", "المدفوع", "المتبقي", "الحالة", ""]}
            rows={invoices.slice(0, 100).map((inv: any) => {
              const due = Number(inv.total || 0) - Number(inv.paid_amount || 0);
              return {
                key: inv.id,
                cells: [
                  <Link to={`/invoices/view/${inv.id}`} className="text-primary font-medium hover:underline">{inv.invoice_number}</Link>,
                  <span className="text-foreground">{inv.date}</span>,
                  <span className="text-foreground font-medium">{fmt(inv.total)}</span>,
                  <span className="text-green-600">{fmt(inv.paid_amount)}</span>,
                  <span className={`font-semibold ${due > 0.01 ? "text-destructive" : "text-foreground"}`}>{fmt(due)}</span>,
                  <StatusBadge value={inv.workflow_status || inv.status} />,
                  <Link to={`/invoices/view/${inv.id}`} className="text-muted-foreground hover:text-primary inline-flex"><ExternalLink size={14} /></Link>,
                ],
              };
            })}
          />
        )}

        {tab === "quotes" && (
          <DataTable
            loading={loadingQt}
            empty="لا توجد عروض أسعار"
            cols={["رقم", "التاريخ", "الإجمالي", "الحالة", ""]}
            rows={quotes.slice(0, 100).map((q: any) => ({
              key: q.id,
              cells: [
                <Link to={`/quotes/view/${q.id}`} className="text-primary font-medium hover:underline">{q.quote_number}</Link>,
                <span className="text-foreground">{q.date}</span>,
                <span className="text-foreground font-medium">{fmt(q.total)}</span>,
                <StatusBadge value={q.status} />,
                <Link to={`/quotes/view/${q.id}`} className="text-muted-foreground hover:text-primary inline-flex"><ExternalLink size={14} /></Link>,
              ],
            }))}
          />
        )}

        {tab === "returns" && (
          <DataTable
            loading={loadingRet}
            empty="لا توجد مرتجعات"
            cols={["رقم", "التاريخ", "الإجمالي", "الحالة", ""]}
            rows={returns.slice(0, 100).map((r: any) => ({
              key: r.id,
              cells: [
                <Link to={`/stock-return/view/${r.id}`} className="text-primary font-medium hover:underline">{r.return_number}</Link>,
                <span className="text-foreground">{r.date || new Date(r.created_at).toLocaleDateString()}</span>,
                <span className="text-foreground font-medium">{fmt(r.total)}</span>,
                <StatusBadge value={r.status} />,
                <Link to={`/stock-return/view/${r.id}`} className="text-muted-foreground hover:text-primary inline-flex"><ExternalLink size={14} /></Link>,
              ],
            }))}
          />
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <div className="text-foreground truncate">{value || "-"}</div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 sm:flex-none px-5 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
        active ? "border-primary text-primary bg-card" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{count}</span>
    </button>
  );
}

const StatusBadge = forwardRef<HTMLSpanElement, { value?: string }>(({ value }, ref) => {
  const v = (value || "").toLowerCase();
  const cls =
    v.includes("paid") || v.includes("مدفوع") || v === "completed" || v === "approved" ? "bg-green-500/10 text-green-600" :
    v.includes("pending") || v.includes("draft") || v.includes("preparing") ? "bg-yellow-500/10 text-yellow-700" :
    v.includes("cancel") || v.includes("rejected") ? "bg-destructive/10 text-destructive" :
    "bg-muted text-muted-foreground";
  return <span ref={ref} className={`text-xs px-2 py-1 rounded ${cls}`}>{value || "-"}</span>;
});
StatusBadge.displayName = "StatusBadge";

const DataTable = forwardRef<HTMLDivElement, { loading?: boolean; empty: string; cols: string[]; rows: { key: string; cells: React.ReactNode[] }[] }>(({ loading, empty, cols, rows }, ref) => {
  return (
    <div ref={ref} className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            {cols.map((c, i) => (
              <th key={i} className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols.length} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="text-center py-8 text-muted-foreground">{empty}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              {r.cells.map((c, i) => <td key={i} className="px-4 py-2.5">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
DataTable.displayName = "DataTable";

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: any; tone: "primary" | "success" | "danger" | "warning" | "muted" }) {
  const toneCls = {
    primary: "bg-primary/10 text-primary",
    success: "bg-green-500/10 text-green-600",
    danger: "bg-destructive/10 text-destructive",
    warning: "bg-yellow-500/10 text-yellow-600",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className="bg-card/80 backdrop-blur rounded-xl border border-border p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded-lg ${toneCls}`}>{icon}</div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground truncate">{value}</p>
    </div>
  );
}
