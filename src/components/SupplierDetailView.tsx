import { useMemo, useState, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import type { StatementData } from "@/utils/statementPrintTemplate";
import {
  FileText, Receipt, Wallet, AlertTriangle, CheckCircle2,
  ArrowLeft, Pencil, Trash2, Phone, MapPin, Home, StickyNote,
  ExternalLink, ClipboardList, Mail, Building2, Truck
} from "lucide-react";

interface Props {
  supplier: any;
  onBack: () => void;
  onEdit: (s: any) => void;
  onDelete: (id: string) => void;
}

type TabKey = "orders" | "transactions";

export default function SupplierDetailView({ supplier, onBack, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<TabKey>("orders");
  const navigate = useNavigate();

  const { data: orders = [], isLoading: loadingOrd } = useQuery({
    queryKey: ["supplier-orders", supplier.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, date, total, status, currency_code, supplier_invoice_number")
        .eq("supplier_id", supplier.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["supplier-transactions", supplier.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, date, type, amount, description, created_at")
        .eq("supplier_id", supplier.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const totalOrders = orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const totalPaid = transactions
      .filter((t: any) => (t.type || "").toLowerCase().includes("pay") || (t.type || "").includes("دفع") || (t.type || "").includes("سداد"))
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const balance = Number(supplier.balance || 0);
    const remaining = Math.max(0, totalOrders - totalPaid);
    return {
      totalOrders, totalPaid, remaining, balance,
      ordersCount: orders.length,
      txCount: transactions.length,
      pendingCount: orders.filter((o: any) => (o.status || "").toLowerCase() === "pending").length,
    };
  }, [orders, transactions, supplier.balance]);

  const fmt = (n: number) => Number(n || 0).toLocaleString();
  const initials = (supplier.name || "?").trim().split(/\s+/).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();

  const handleStatement = async () => {
    const { data: companyRow } = await supabase
      .from("company_settings")
      .select("company_name, phone, address, email, logo_url, currency")
      .maybeSingle();
    const payload: StatementData = {
      kind: "supplier",
      party: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        address: supplier.address,
        email: supplier.email,
        balance: Number(supplier.balance || 0),
      },
      company: (companyRow as any) || undefined,
      orders: orders.map((o: any) => ({
        order_number: o.order_number,
        date: o.date,
        total: Number(o.total || 0),
        status: o.status,
      })),
      transactions: transactions.map((t: any) => ({
        date: t.date,
        type: t.type,
        amount: Number(t.amount || 0),
        description: t.description,
      })),
      totals: {
        ordersTotal: stats.totalOrders,
        balance: Number(supplier.balance || 0),
      },
    };
    sessionStorage.setItem("lov_statement_preview", JSON.stringify(payload));
    navigate("/reports/statement-preview");
  };

  return (
    <div className="space-y-6">
      {/* Header / Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary))_0,transparent_60%)]" />
        <div className="relative p-6 flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold shadow-md">
              {initials || <Truck size={24} />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{supplier.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                {supplier.company && <span className="flex items-center gap-1"><Building2 size={14} />{supplier.company}</span>}
                {supplier.phone && <span className="flex items-center gap-1"><Phone size={14} />{supplier.phone}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={onBack} className="bg-card border border-border text-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-muted">
              <ArrowLeft size={16} /> رجوع
            </button>
            <button
              onClick={handleStatement}
              className="bg-card border border-border text-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:bg-muted"
            >
              <ClipboardList size={16} /> كشف حساب
            </button>
            <button onClick={() => onEdit(supplier)} className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:opacity-90">
              <Pencil size={16} /> تعديل
            </button>
            <button onClick={() => onDelete(supplier.id)} className="bg-destructive text-destructive-foreground px-3 py-2 rounded-lg text-sm flex items-center gap-1 hover:opacity-90">
              <Trash2 size={16} /> حذف
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 px-6 pb-6">
          <StatCard icon={<FileText size={18} />} label="فواتير الشراء" value={stats.ordersCount} tone="primary" />
          <StatCard icon={<Receipt size={18} />} label="إجمالي المشتريات" value={fmt(stats.totalOrders)} tone="primary" />
          <StatCard icon={<CheckCircle2 size={18} />} label="المدفوع للمورد" value={fmt(stats.totalPaid)} tone="success" />
          <StatCard icon={<Wallet size={18} />} label="المستحق للمورد" value={fmt(stats.balance)} tone="danger" />
          <StatCard icon={<AlertTriangle size={18} />} label="فواتير معلّقة" value={stats.pendingCount} tone="warning" />
          <StatCard icon={<Receipt size={18} />} label="حركات مالية" value={stats.txCount} tone="muted" />
        </div>
      </div>

      {/* Supplier Info card */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Truck size={16} /> بيانات المورد</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <InfoRow icon={<Phone size={14} />} label="الهاتف" value={supplier.phone} />
          <InfoRow icon={<Mail size={14} />} label="البريد الإلكتروني" value={supplier.email} />
          <InfoRow icon={<Building2 size={14} />} label="الشركة" value={supplier.company} />
          <InfoRow icon={<Home size={14} />} label="العنوان" value={supplier.address} />
          <InfoRow icon={<Wallet size={14} />} label="الرصيد الحالي" value={fmt(Number(supplier.balance || 0))} />
          <InfoRow icon={<StickyNote size={14} />} label="ملاحظات" value={supplier.notes} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex border-b border-border bg-muted/30">
          <TabBtn active={tab === "orders"} onClick={() => setTab("orders")} icon={<FileText size={15} />} label="فواتير الشراء" count={orders.length} />
          <TabBtn active={tab === "transactions"} onClick={() => setTab("transactions")} icon={<Receipt size={15} />} label="الحركات المالية" count={transactions.length} />
        </div>

        {tab === "orders" && (
          <DataTable
            loading={loadingOrd}
            empty="لا توجد فواتير شراء"
            cols={["رقم الأمر", "التاريخ", "رقم فاتورة المورد", "الإجمالي", "العملة", "الحالة", ""]}
            rows={orders.slice(0, 100).map((o: any) => ({
              key: o.id,
              cells: [
                <Link to={`/purchase/view/${o.id}`} className="text-primary font-medium hover:underline">{o.order_number}</Link>,
                <span className="text-foreground">{o.date}</span>,
                <span className="text-muted-foreground">{o.supplier_invoice_number || "-"}</span>,
                <span className="text-foreground font-medium">{fmt(o.total)}</span>,
                <span className="text-muted-foreground text-xs">{o.currency_code || "-"}</span>,
                <StatusBadge value={o.status} />,
                <Link to={`/purchase/view/${o.id}`} className="text-muted-foreground hover:text-primary inline-flex"><ExternalLink size={14} /></Link>,
              ],
            }))}
          />
        )}

        {tab === "transactions" && (
          <DataTable
            loading={loadingTx}
            empty="لا توجد حركات مالية"
            cols={["التاريخ", "النوع", "المبلغ", "الوصف"]}
            rows={transactions.slice(0, 100).map((t: any) => ({
              key: t.id,
              cells: [
                <span className="text-foreground">{t.date || (t.created_at ? new Date(t.created_at).toLocaleDateString("en-GB") : "-")}</span>,
                <StatusBadge value={t.type} />,
                <span className="text-foreground font-medium">{fmt(t.amount)}</span>,
                <span className="text-muted-foreground">{t.description || "-"}</span>,
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
    v.includes("paid") || v.includes("مدفوع") || v === "completed" || v === "approved" || v.includes("سداد") || v.includes("دفع") ? "bg-green-500/10 text-green-600" :
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
