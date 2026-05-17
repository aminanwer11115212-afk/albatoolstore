import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuppliers, useCompanySettings } from "@/hooks/useData";
import { Printer } from "lucide-react";
import type { StatementData } from "@/utils/statementPrintTemplate";

export default function SupplierStatementPage() {
  const { data: suppliers } = useSuppliers();
  const { data: companyArr } = useCompanySettings();
  const company = (companyArr as any)?.[0] || null;
  const [selectedSupplierId, setSelectedSupplierId] = useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["supplier-orders", selectedSupplierId],
    queryFn: async () => {
      if (!selectedSupplierId) return [];
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("supplier_id", selectedSupplierId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSupplierId,
  });

  const { data: transactions } = useQuery({
    queryKey: ["supplier-transactions", selectedSupplierId],
    queryFn: async () => {
      if (!selectedSupplierId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("supplier_id", selectedSupplierId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSupplierId,
  });

  const selectedSupplier = (suppliers || []).find((s: any) => s.id === selectedSupplierId);
  const totalOrders = (orders || []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);

  const navigate = useNavigate();
  const handleOpenPrint = () => {
    if (!selectedSupplier) return;
    const payload: StatementData = {
      kind: "supplier",
      party: {
        id: selectedSupplier.id,
        name: selectedSupplier.name,
        phone: selectedSupplier.phone,
        address: selectedSupplier.address,
        email: selectedSupplier.email,
        balance: Number(selectedSupplier.balance || 0),
      },
      company: company || undefined,
      orders: (orders || []).map((o: any) => ({
        order_number: o.order_number,
        date: o.date,
        total: Number(o.total || 0),
        status: o.status,
      })),
      transactions: (transactions || []).map((t: any) => ({
        date: t.date,
        type: t.type,
        amount: Number(t.amount || 0),
        description: t.description,
      })),
      totals: {
        ordersTotal: totalOrders,
        balance: Number(selectedSupplier.balance || 0),
      },
    };
    sessionStorage.setItem("lov_statement_preview", JSON.stringify(payload));
    navigate("/reports/statement-preview");
  };

  return (
    <div className="space-y-6">
      {selectedSupplier && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleOpenPrint}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm"
          >
            <Printer className="h-4 w-4" />
            معاينة وطباعة كشف الحساب
          </button>
        </div>
      )}

      <div className="printable-statement space-y-6">
      <h1 data-section="header" data-section-label="العنوان" className="text-2xl font-bold text-foreground">كشف حساب مورد</h1>

      <div data-section="selector" data-section-label="اختيار المورد" className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <label className="block text-sm font-medium text-foreground mb-2">اختر المورد</label>
        <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}
          className="bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full md:w-96">
          <option value="">-- اختر مورد --</option>
          {(suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {selectedSupplier && (
        <>
          <div data-section="summary" data-section-label="صناديق الملخص" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">المورد</p>
              <p className="text-lg font-bold text-foreground">{selectedSupplier.name}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">إجمالي أوامر الشراء</p>
              <p className="text-lg font-bold text-primary">{totalOrders.toLocaleString()}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">الرصيد</p>
              <p className="text-lg font-bold text-foreground">{Number(selectedSupplier.balance || 0).toLocaleString()}</p>
            </div>
          </div>

          <div data-section="orders" data-section-label="أوامر الشراء" className="legacy-card card-block">
            <h3 className="px-5 py-3 font-semibold text-foreground border-b border-border">أوامر الشراء</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted">
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">رقم الأمر</th>
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المبلغ</th>
                  <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الحالة</th>
                </tr></thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                  : !(orders || []).length ? <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد أوامر شراء</td></tr>
                  : (orders || []).map((o: any) => (
                    <tr key={o.id} className="border-b border-border hover:bg-muted/50">
                      <td className="px-5 py-3 text-foreground">{o.order_number}</td>
                      <td className="px-5 py-3 text-foreground">{o.date}</td>
                      <td className="px-5 py-3 text-foreground">{Number(o.total).toLocaleString()}</td>
                      <td className="px-5 py-3 text-foreground">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(transactions || []).length > 0 && (
            <div data-section="transactions" data-section-label="المعاملات" className="legacy-card card-block">
              <h3 className="px-5 py-3 font-semibold text-foreground border-b border-border">المعاملات</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted">
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المبلغ</th>
                    <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الوصف</th>
                  </tr></thead>
                  <tbody>
                    {(transactions || []).map((t: any) => (
                      <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-5 py-3 text-foreground">{t.date}</td>
                        <td className="px-5 py-3 text-foreground">{Number(t.amount).toLocaleString()}</td>
                        <td className="px-5 py-3 text-muted-foreground">{t.description || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
