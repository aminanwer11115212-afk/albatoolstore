import { useState } from "react";
import { useTransactionsWithAccounts } from "@/hooks/useData";
import { TrendingUp, TrendingDown, DollarSign, Calendar } from "lucide-react";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";

export default function IncomeReportPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const { data: transactions, isLoading } = useTransactionsWithAccounts();

  const filtered = (transactions || []).filter((t: any) => t.date >= dateFrom && t.date <= dateTo);
  const income = filtered.filter((t: any) => t.type === "income");
  const expenses = filtered.filter((t: any) => t.type === "expense");
  const totalIncome = income.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
  const totalExpenses = expenses.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
  const net = totalIncome - totalExpenses;

  // Group by category
  const incomeByCategory: Record<string, number> = {};
  income.forEach((t: any) => {
    const cat = t.category || "غير مصنف";
    incomeByCategory[cat] = (incomeByCategory[cat] || 0) + Number(t.amount || 0);
  });
  const expensesByCategory: Record<string, number> = {};
  expenses.forEach((t: any) => {
    const cat = t.category || "غير مصنف";
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Number(t.amount || 0);
  });

  const sections = [
    { key: "header", label: "الترويسة" },
    { key: "filters", label: "الفلاتر" },
    { key: "summary", label: "البطاقات الموجزة" },
    { key: "categories", label: "التحليل حسب الفئة" },
    { key: "transactions", label: "تفاصيل المعاملات" },
  ];

  return (
    <div className="space-y-6">
      <PrintVisibilityToolbar
        storageKey="income-report"
        containerSelector=".printable-statement"
        sections={sections}
        shareTitle="بيان الدخل والمصروفات"
        shareSummary={`الإيرادات: ${totalIncome.toLocaleString()} | المصروفات: ${totalExpenses.toLocaleString()} | الصافي: ${net.toLocaleString()}`}
        pdfFilename="بيان-الدخل"
      />
      <div className="printable-statement space-y-6">
        <ReportPrintHeader title="بيان الدخل والمصروفات" periodText={`من ${dateFrom} إلى ${dateTo}`} />

        <h1 className="text-2xl font-bold text-foreground print:hidden">بيان الدخل والمصروفات</h1>

      {/* Date Filters */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm" data-section="filters" data-section-label="الفلاتر">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">من تاريخ</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="bg-muted rounded-lg px-4 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="bg-muted rounded-lg px-4 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-section="summary" data-section-label="البطاقات الموجزة">
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center"><TrendingUp size={20} className="text-green-600" /></div>
            <span className="text-sm text-muted-foreground">إجمالي الإيرادات</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{totalIncome.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">{income.length} معاملة</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center"><TrendingDown size={20} className="text-red-600" /></div>
            <span className="text-sm text-muted-foreground">إجمالي المصروفات</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{totalExpenses.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">{expenses.length} معاملة</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign size={20} className="text-primary" /></div>
            <span className="text-sm text-muted-foreground">صافي الربح</span>
          </div>
          <div className={`text-2xl font-bold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>{net.toLocaleString()}</div>
        </div>
      </div>

      {/* Income by Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-section="categories" data-section-label="التحليل حسب الفئة">
        <div className="legacy-card card-block">
          <div className="p-4 border-b border-border"><h3 className="font-semibold text-foreground">الإيرادات حسب الفئة</h3></div>
          <div className="p-4 space-y-2">
            {Object.entries(incomeByCategory).length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">لا توجد إيرادات</p>
            ) : Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-foreground">{cat}</span>
                <span className="text-sm font-bold text-green-600">{amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="legacy-card card-block">
          <div className="p-4 border-b border-border"><h3 className="font-semibold text-foreground">المصروفات حسب الفئة</h3></div>
          <div className="p-4 space-y-2">
            {Object.entries(expensesByCategory).length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">لا توجد مصروفات</p>
            ) : Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm text-foreground">{cat}</span>
                <span className="text-sm font-bold text-red-600">{amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="legacy-card card-block" data-section="transactions" data-section-label="تفاصيل المعاملات">
        <div className="p-4 border-b border-border"><h3 className="font-semibold text-foreground">تفاصيل المعاملات</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted">
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">التاريخ</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">النوع</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الفئة</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الحساب</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الوصف</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المبلغ</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد معاملات</td></tr>
              : filtered.slice(0, 50).map((t: any, i: number) => (
                <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 text-foreground">{t.date}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.type === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {t.type === "income" ? "إيراد" : "مصروف"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{t.category || "-"}</td>
                  <td className="px-4 py-3 text-foreground">{(t.accounts as any)?.name || "-"}</td>
                  <td className="px-4 py-3 text-foreground">{t.description || "-"}</td>
                  <td className={`px-4 py-3 font-bold ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
                    {Number(t.amount || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
