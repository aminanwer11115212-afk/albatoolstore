import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";

type DebtorRow = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  computed_due: number;
  invoice_count: number;
};

export default function CustomerDebtReportPage() {
  const qc = useQueryClient();
  const [recalculating, setRecalculating] = useState(false);

  const { data: debtors, isLoading } = useQuery<DebtorRow[]>({
    queryKey: ["customer-debt-report"],
    queryFn: async () => {
      // Fetch customers + their invoice aggregates in one go
      const { data: custs, error: cErr } = await supabase
        .from("customers")
        .select("id, name, phone, balance")
        .gt("balance", 0)
        .order("balance", { ascending: false });
      if (cErr) throw cErr;

      const ids = (custs || []).map((c: any) => c.id);
      if (ids.length === 0) return [];

      const { data: invs, error: iErr } = await supabase
        .from("invoices")
        .select("customer_id, total, paid_amount")
        .in("customer_id", ids)
        .neq("source", "pos");
      if (iErr) throw iErr;

      const map = new Map<string, { due: number; count: number }>();
      for (const inv of invs || []) {
        const cur = map.get(inv.customer_id) || { due: 0, count: 0 };
        cur.due += Number(inv.total || 0) - Number(inv.paid_amount || 0);
        cur.count += 1;
        map.set(inv.customer_id, cur);
      }

      return (custs || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        balance: Number(c.balance || 0),
        computed_due: map.get(c.id)?.due || 0,
        invoice_count: map.get(c.id)?.count || 0,
      }));
    },
  });

  const totalDebt = (debtors || []).reduce((s, d) => s + d.balance, 0);
  const mismatchCount = (debtors || []).filter(
    (d) => Math.abs(d.balance - d.computed_due) > 0.01
  ).length;

  const handleRecalc = async () => {
    setRecalculating(true);
    try {
      const { error } = await supabase.rpc("recalc_all_customer_balances");
      if (error) throw error;
      toast.success("تم إعادة حساب أرصدة جميع العملاء");
      await qc.invalidateQueries({ queryKey: ["customer-debt-report"] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e: any) {
      toast.error(e.message || "فشل إعادة الحساب");
    } finally {
      setRecalculating(false);
    }
  };

  const sections = [
    { key: "header", label: "الترويسة" },
    { key: "actions", label: "الإجراءات" },
    { key: "summary", label: "الملخص" },
    { key: "table", label: "جدول المَدينين" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <PrintVisibilityToolbar
        storageKey="customer-debt-report"
        containerSelector=".printable-statement"
        sections={sections}
        shareTitle="تقرير المبالغ المستحقة على العملاء"
        shareSummary={`عدد المَدينين: ${(debtors || []).length} | الإجمالي: ${totalDebt.toLocaleString()}`}
        pdfFilename="تقرير-ديون-العملاء"
      />
      <div className="printable-statement space-y-4">
        <ReportPrintHeader title="تقرير المبالغ المستحقة على العملاء" />

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden" data-section="actions" data-section-label="الإجراءات">
        <h1 className="text-2xl font-bold text-foreground">تقرير المبالغ المستحقة</h1>
        <button
          onClick={handleRecalc}
          disabled={recalculating}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          title="إعادة حساب أرصدة كل العملاء من فواتيرهم"
        >
          <RefreshCw size={14} className={recalculating ? "animate-spin" : ""} />
          {recalculating ? "جاري الحساب..." : "إعادة حساب الأرصدة"}
        </button>
      </div>

      <div className="legacy-card card-block p-4 space-y-1" data-section="summary" data-section-label="الملخص">
        <p className="text-sm text-muted-foreground">
          عدد المَدينين: <span className="font-bold text-foreground">{(debtors || []).length}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          إجمالي المبالغ المستحقة:{" "}
          <span className="font-bold text-destructive">{totalDebt.toLocaleString()}</span>
        </p>
        {mismatchCount > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ يوجد {mismatchCount} عميل برصيد لا يطابق فواتيره — اضغط "إعادة حساب الأرصدة" للتصحيح.
          </p>
        )}
      </div>

      <div className="legacy-card card-block" data-section="table" data-section-label="جدول المَدينين">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الاسم</th>
                
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">عدد الفواتير</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">
                  المستحق من الفواتير
                </th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">
                  الرصيد المسجل
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    جاري التحميل...
                  </td>
                </tr>
              ) : (debtors || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    لا توجد مبالغ مستحقة
                  </td>
                </tr>
              ) : (
                (debtors || []).map((c, i) => {
                  const mismatch = Math.abs(c.balance - c.computed_due) > 0.01;
                  return (
                    <tr key={c.id} className="border-b border-border hover:bg-muted/50">
                      <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                      
                      <td className="px-4 py-3 text-muted-foreground">{c.invoice_count}</td>
                      <td className="px-4 py-3 text-foreground">
                        {c.computed_due.toLocaleString()}
                      </td>
                      <td
                        className={`px-4 py-3 font-bold ${
                          mismatch ? "text-amber-600 dark:text-amber-400" : "text-destructive"
                        }`}
                        title={mismatch ? "الرصيد لا يطابق المستحق المحسوب" : ""}
                      >
                        {c.balance.toLocaleString()}
                        {mismatch && <span className="mr-1">⚠️</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
