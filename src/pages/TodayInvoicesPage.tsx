import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusChip } from "@/components/ui/status-chip";
import HomeButton from "@/components/HomeButton";

export default function TodayInvoicesPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["today-invoices", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name)")
        .eq("date", today)
        // استبعاد مبيعات الكاش (POS) — لها صفحة وتقارير مستقلة
        .neq("source", "pos")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totalAmount = (invoices || []).reduce((s: number, inv: any) => s + Number(inv.total || 0), 0);
  const paidAmount = (invoices || []).reduce((s: number, inv: any) => s + Number(inv.paid_amount || 0), 0);

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-foreground">فواتير اليوم - {today}</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">عدد الفواتير</p>
          <p className="text-2xl font-bold text-foreground">{(invoices || []).length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">إجمالي المبلغ</p>
          <p className="text-2xl font-bold text-primary">{totalAmount.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">المدفوع</p>
          <p className="text-2xl font-bold text-success">{paidAmount.toLocaleString()}</p>
        </div>
      </div>

      <div className="legacy-card card-block">
        <HomeButton />
        <div className="overflow-x-auto">
          <table className="w-full text-sm mobile-stack-table">
            <thead><tr className="bg-muted">
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">رقم الفاتورة</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">العميل</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المبلغ</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المدفوع</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الحالة</th>
              <th className="text-right px-5 py-3 font-semibold text-muted-foreground">إجراءات</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : !(invoices || []).length ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد فواتير اليوم</td></tr>
              : (invoices || []).map((inv: any) => (
                <tr key={inv.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td data-label="رقم الفاتورة" className="px-5 py-3 text-foreground font-medium">{inv.invoice_number}</td>
                  <td data-label="العميل" className="px-5 py-3 text-foreground">{inv.customers?.name || "بدون عميل"}</td>
                  <td data-label="المبلغ" className="px-5 py-3 text-foreground">{Number(inv.total).toLocaleString()}</td>
                  <td data-label="المدفوع" className="px-5 py-3 text-foreground">{Number(inv.paid_amount).toLocaleString()}</td>
                  <td data-label="الحالة" className="px-5 py-3">
                    <StatusChip kind="payment" value={inv.status} />
                  </td>
                  <td data-label="إجراءات" className="px-5 py-3">
                    <button onClick={() => navigate(`/invoices/view/${inv.id}`)} className="p-2 text-primary hover:bg-primary/10 rounded min-h-[44px] min-w-[44px] inline-flex items-center justify-center" aria-label="عرض الفاتورة"><Eye size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
