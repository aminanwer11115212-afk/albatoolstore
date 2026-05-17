import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoicesWithCustomers, useTransactionsWithAccounts, useProducts, useCustomers, useSuppliers, useCompanySettings } from "@/hooks/useData";
import { BarChart3, TrendingUp, TrendingDown, ShoppingCart, FileText, Users, Package, DollarSign, Percent, AlertTriangle, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar } from "recharts";
import type { FinancialReportData } from "@/utils/financialReportPrintTemplate";

const monthNames: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس", "04": "أبريل",
  "05": "مايو", "06": "يونيو", "07": "يوليو", "08": "أغسطس",
  "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر", "12": "ديسمبر",
};

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function filterByPeriod<T extends { date?: string }>(items: T[], period: string): T[] {
  if (period === "all") return items;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return items.filter((item) => {
    if (!item.date) return false;
    const d = new Date(item.date);
    if (period === "month") return d.getFullYear() === y && d.getMonth() === m;
    if (period === "quarter") {
      const q = Math.floor(m / 3);
      const dq = Math.floor(d.getMonth() / 3);
      return d.getFullYear() === y && dq === q;
    }
    if (period === "year") return d.getFullYear() === y;
    return true;
  });
}

export default function StatisticsPage() {
  const { data: invoicesRaw, isLoading: loadingInv } = useInvoicesWithCustomers();
  const { data: transactionsRaw, isLoading: loadingTx } = useTransactionsWithAccounts();
  const { data: products } = useProducts();
  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const { data: companyArr } = useCompanySettings();
  const company = (companyArr as any)?.[0] || null;
  const navigate = useNavigate();
  const [period, setPeriod] = useState("all");

  const invoices = useMemo(() => filterByPeriod(invoicesRaw || [], period), [invoicesRaw, period]);
  const transactions = useMemo(() => filterByPeriod(transactionsRaw || [], period), [transactionsRaw, period]);

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const data: Record<string, { revenue: number; expenses: number; sales: number; invoiceCount: number }> = {};
    invoices.forEach((inv: any) => {
      const month = inv.date?.substring(0, 7);
      if (!month) return;
      if (!data[month]) data[month] = { revenue: 0, expenses: 0, sales: 0, invoiceCount: 0 };
      data[month].sales += Number(inv.total || 0);
      data[month].invoiceCount += 1;
    });
    transactions.forEach((t: any) => {
      const month = t.date?.substring(0, 7);
      if (!month) return;
      if (!data[month]) data[month] = { revenue: 0, expenses: 0, sales: 0, invoiceCount: 0 };
      if (t.type === "income") data[month].revenue += Number(t.amount || 0);
      if (t.type === "expense") data[month].expenses += Number(t.amount || 0);
    });
    return data;
  }, [invoices, transactions]);

  const sorted = Object.entries(monthlyData).sort((a, b) => a[0].localeCompare(b[0]));
  const totalRevenue = sorted.reduce((s, [, d]) => s + d.revenue, 0);
  const totalExpenses = sorted.reduce((s, [, d]) => s + d.expenses, 0);
  const totalSales = sorted.reduce((s, [, d]) => s + d.sales, 0);
  const totalInvoices = sorted.reduce((s, [, d]) => s + d.invoiceCount, 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0";
  const avgInvoiceValue = totalInvoices > 0 ? Math.round(totalSales / totalInvoices) : 0;

  const chartData = sorted.map(([month, d]) => {
    const [y, m] = month.split("-");
    return { name: `${monthNames[m] || m}`, revenue: d.revenue, expenses: d.expenses, sales: d.sales, net: d.revenue - d.expenses, invoices: d.invoiceCount };
  });

  // Invoice status
  const statusDist = useMemo(() => {
    const dist: Record<string, number> = {};
    invoices.forEach((inv: any) => {
      const s = inv.status || "غير محدد";
      dist[s] = (dist[s] || 0) + 1;
    });
    const labels: Record<string, string> = { paid: "مدفوعة", pending: "معلقة", overdue: "متأخرة", cancelled: "ملغاة", draft: "عرض سعر" };
    return Object.entries(dist).map(([name, value]) => ({ name: labels[name] || name, value }));
  }, [invoices]);

  // Top customers
  const topCustomers = useMemo(() => {
    const cust: Record<string, { name: string; total: number; count: number }> = {};
    invoices.forEach((inv: any) => {
      const id = inv.customer_id || "unknown";
      const name = inv.customers?.name || "عميل غير محدد";
      if (!cust[id]) cust[id] = { name, total: 0, count: 0 };
      cust[id].total += Number(inv.total || 0);
      cust[id].count += 1;
    });
    return Object.values(cust).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [invoices]);

  // Payment methods
  const paymentMethods = useMemo(() => {
    const methods: Record<string, number> = {};
    invoices.forEach((inv: any) => {
      const m = inv.payment_method || "غير محدد";
      methods[m] = (methods[m] || 0) + Number(inv.total || 0);
    });
    const labels: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", card: "بطاقة" };
    return Object.entries(methods).map(([name, value]) => ({ name: labels[name] || name, value }));
  }, [invoices]);

  // Expense categories
  const txCategories = useMemo(() => {
    const cats: Record<string, number> = {};
    transactions.forEach((t: any) => {
      if (t.type === "expense") {
        const c = t.category || "أخرى";
        cats[c] = (cats[c] || 0) + Number(t.amount || 0);
      }
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [transactions]);

  // Product stats
  const productStats = useMemo(() => {
    const prods = products || [];
    const totalStock = prods.reduce((s, p: any) => s + (p.stock_quantity || 0), 0);
    const totalStockValue = prods.reduce((s, p: any) => s + (p.stock_quantity || 0) * (p.purchase_price || 0), 0);
    const lowStock = prods.filter((p: any) => (p.stock_quantity || 0) <= (p.min_stock || 0) && (p.min_stock || 0) > 0);
    const topByValue = [...prods].sort((a: any, b: any) => ((b.stock_quantity || 0) * (b.sale_price || 0)) - ((a.stock_quantity || 0) * (a.sale_price || 0))).slice(0, 10);
    const categoryDist: Record<string, number> = {};
    prods.forEach((p: any) => {
      const cat = p.category_id ? "مصنف" : "غير مصنف";
      categoryDist[cat] = (categoryDist[cat] || 0) + 1;
    });
    return { totalStock, totalStockValue, lowStock, topByValue, count: prods.length };
  }, [products]);

  // Due amounts
  const totalDue = useMemo(() => {
    return invoices.reduce((s, inv: any) => s + Number(inv.due_amount || 0), 0);
  }, [invoices]);

  const isLoading = loadingInv || loadingTx;

  const periodLabel: Record<string, string> = { all: "كل الفترات", year: "هذه السنة", quarter: "هذا الربع", month: "هذا الشهر" };

  const openPreview = () => {
    const payload: FinancialReportData = {
      title: "تقرير الإحصائيات والدخل",
      subtitle: periodLabel[period] || "",
      company: company || null,
      currency: company?.currency || "",
      summary: [
        { label: "الإيرادات", value: totalRevenue, color: "green" },
        { label: "المصروفات", value: totalExpenses, color: "red" },
        { label: "صافي الربح", value: netProfit, color: netProfit >= 0 ? "green" : "red" },
        { label: "هامش الربح", value: `${profitMargin}%`, color: "purple" },
        { label: "المبيعات", value: totalSales, color: "blue" },
        { label: "عدد الفواتير", value: totalInvoices, color: "purple" },
        { label: "المستحقات", value: totalDue, color: "red" },
        { label: "متوسط قيمة الفاتورة", value: avgInvoiceValue, color: "blue" },
      ],
      sections: [
        {
          key: "monthly", label: "الأداء الشهري",
          columns: [
            { key: "name", label: "الشهر", align: "right" },
            { key: "revenue", label: "الإيرادات", numeric: true },
            { key: "expenses", label: "المصروفات", numeric: true },
            { key: "net", label: "صافي الربح", numeric: true },
            { key: "sales", label: "المبيعات", numeric: true },
            { key: "invoices", label: "عدد الفواتير", numeric: true },
          ],
          rows: chartData,
          totals: {
            name: "الإجمالي",
            revenue: totalRevenue, expenses: totalExpenses,
            net: netProfit, sales: totalSales, invoices: totalInvoices,
          },
          headerColor: "#5b2c8e",
        },
        {
          key: "topCustomers", label: "أفضل العملاء",
          columns: [
            { key: "name", label: "العميل", align: "right" },
            { key: "count", label: "عدد الفواتير", numeric: true },
            { key: "total", label: "الإجمالي", numeric: true },
          ],
          rows: topCustomers,
          headerColor: "#2980b9",
        },
        {
          key: "expenseCats", label: "المصروفات حسب الفئة",
          columns: [
            { key: "name", label: "الفئة", align: "right" },
            { key: "value", label: "المبلغ", numeric: true },
          ],
          rows: txCategories,
          totals: { name: "الإجمالي", value: txCategories.reduce((s, c) => s + c.value, 0) },
          headerColor: "#dc2626",
        },
        {
          key: "paymentMethods", label: "طرق الدفع",
          columns: [
            { key: "name", label: "الطريقة", align: "right" },
            { key: "value", label: "المبلغ", numeric: true },
          ],
          rows: paymentMethods,
          totals: { name: "الإجمالي", value: paymentMethods.reduce((s, c) => s + c.value, 0) },
          headerColor: "#16a34a",
        },
        {
          key: "statusDist", label: "توزيع حالات الفواتير",
          columns: [
            { key: "name", label: "الحالة", align: "right" },
            { key: "value", label: "العدد", numeric: true },
          ],
          rows: statusDist,
          headerColor: "#f59e0b",
        },
      ],
    };
    sessionStorage.setItem("lov_financial_report_preview", JSON.stringify(payload));
    navigate("/reports/financial-preview");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">الإحصائيات والتقارير</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openPreview}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-sm font-semibold shadow-sm"
          >
            <Eye size={16} /> معاينة وطباعة
          </button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفترات</SelectItem>
              <SelectItem value="year">هذه السنة</SelectItem>
              <SelectItem value="quarter">هذا الربع</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: "الإيرادات", value: totalRevenue, icon: <TrendingUp size={16} />, color: "text-primary", curr: true },
          { label: "المصروفات", value: totalExpenses, icon: <TrendingDown size={16} />, color: "text-destructive", curr: true },
          { label: "صافي الربح", value: netProfit, icon: <DollarSign size={16} />, color: netProfit >= 0 ? "text-primary" : "text-destructive", curr: true },
          { label: "هامش الربح", value: profitMargin + "%", icon: <Percent size={16} />, color: "text-foreground", curr: false, raw: true },
          { label: "المبيعات", value: totalSales, icon: <ShoppingCart size={16} />, color: "text-foreground", curr: true },
          { label: "الفواتير", value: totalInvoices, icon: <FileText size={16} />, color: "text-foreground", curr: false },
          { label: "المستحقات", value: totalDue, icon: <AlertTriangle size={16} />, color: "text-destructive", curr: true },
          { label: "المنتجات", value: productStats.count, icon: <Package size={16} />, color: "text-foreground", curr: false },
        ].map((card, i) => (
          <Card key={i}>
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">{card.icon}<span className="text-[10px]">{card.label}</span></div>
              <p className={`text-sm font-bold ${card.color}`}>
                {(card as any).raw ? card.value : card.curr ? `${Number(card.value).toLocaleString()}` : Number(card.value).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="revenue">الإيرادات والمصروفات</TabsTrigger>
          <TabsTrigger value="invoices">الفواتير</TabsTrigger>
          <TabsTrigger value="customers">العملاء</TabsTrigger>
          <TabsTrigger value="products">المنتجات والمخزون</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">الإيرادات مقابل المصروفات</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? <p className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</p> : chartData.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="revenue" name="الإيرادات" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="المصروفات" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">صافي الربح الشهري</CardTitle></CardHeader>
              <CardContent>
                {chartData.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="net" name="صافي الربح" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.15} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">تطور المبيعات والفواتير</CardTitle></CardHeader>
            <CardContent>
              {chartData.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="left" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="sales" name="المبيعات" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="invoices" name="عدد الفواتير" stroke={COLORS[2]} strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Quick stats row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">متوسط قيمة الفاتورة</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{avgInvoiceValue.toLocaleString()} </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">عدد العملاء</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{(customers?.length || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{(suppliers?.length || 0)} مورد</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">تنبيهات المخزون</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-destructive">{productStats.lowStock.length}</p>
                <p className="text-xs text-muted-foreground mt-1">منتج تحت الحد الأدنى</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">توزيع المصروفات حسب الفئة</CardTitle></CardHeader>
              <CardContent>
                {txCategories.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={txCategories} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                        {txCategories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">طرق الدفع</CardTitle></CardHeader>
              <CardContent>
                {paymentMethods.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={paymentMethods} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} label={({ name }) => name} fontSize={11}>
                        {paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Expense categories table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">تفاصيل فئات المصروفات</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted">
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الفئة</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المبلغ</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">النسبة</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground w-40"></th>
                  </tr></thead>
                  <tbody>
                    {txCategories.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد بيانات</td></tr>
                    : txCategories.map((cat, i) => {
                      const pct = totalExpenses > 0 ? (cat.value / totalExpenses) * 100 : 0;
                      return (
                        <tr key={i} className="border-b border-border hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {cat.name}
                          </td>
                          <td className="px-4 py-3">{cat.value.toLocaleString()}</td>
                          <td className="px-4 py-3">{pct.toFixed(1)}%</td>
                          <td className="px-4 py-3"><Progress value={pct} className="h-2" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">جدول الإحصائيات الشهرية</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted">
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الشهر</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الإيرادات</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المصروفات</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">صافي</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المبيعات</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الفواتير</th>
                  </tr></thead>
                  <tbody>
                    {sorted.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد بيانات</td></tr>
                    : [...sorted].reverse().map(([month, d]) => {
                      const [y, m] = month.split("-");
                      const net = d.revenue - d.expenses;
                      return (
                        <tr key={month} className="border-b border-border hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium">{monthNames[m] || m} {y}</td>
                          <td className="px-4 py-3 text-primary font-medium">{d.revenue.toLocaleString()}</td>
                          <td className="px-4 py-3 text-destructive font-medium">{d.expenses.toLocaleString()}</td>
                          <td className={`px-4 py-3 font-bold ${net >= 0 ? "text-primary" : "text-destructive"}`}>{net.toLocaleString()}</td>
                          <td className="px-4 py-3">{d.sales.toLocaleString()}</td>
                          <td className="px-4 py-3">{d.invoiceCount}</td>
                        </tr>
                      );
                    })}
                    {sorted.length > 0 && (
                      <tr className="bg-muted font-bold">
                        <td className="px-4 py-3">الإجمالي</td>
                        <td className="px-4 py-3 text-primary">{totalRevenue.toLocaleString()}</td>
                        <td className="px-4 py-3 text-destructive">{totalExpenses.toLocaleString()}</td>
                        <td className={`px-4 py-3 ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>{netProfit.toLocaleString()}</td>
                        <td className="px-4 py-3">{totalSales.toLocaleString()}</td>
                        <td className="px-4 py-3">{totalInvoices}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">حالة الفواتير</CardTitle></CardHeader>
              <CardContent>
                {statusDist.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name} (${value})`} fontSize={11}>
                        {statusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">عدد الفواتير الشهري</CardTitle></CardHeader>
              <CardContent>
                {chartData.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="invoices" name="عدد الفواتير" fill={COLORS[4]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Invoice status summary */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص حالات الفواتير</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted">
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الحالة</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">العدد</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">النسبة</th>
                    <th className="px-4 py-3 w-40"></th>
                  </tr></thead>
                  <tbody>
                    {statusDist.map((s, i) => {
                      const pct = totalInvoices > 0 ? (s.value / totalInvoices) * 100 : 0;
                      return (
                        <tr key={i} className="border-b border-border hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {s.name}
                          </td>
                          <td className="px-4 py-3 font-bold">{s.value}</td>
                          <td className="px-4 py-3">{pct.toFixed(1)}%</td>
                          <td className="px-4 py-3"><Progress value={pct} className="h-2" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">أفضل العملاء حسب المبيعات</CardTitle></CardHeader>
            <CardContent>
              {topCustomers.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</p> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topCustomers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis type="category" dataKey="name" width={120} fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="total" name="إجمالي المبيعات" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ترتيب العملاء التفصيلي</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted">
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">العميل</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">عدد الفواتير</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">إجمالي المشتريات</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">متوسط الفاتورة</th>
                </tr></thead>
                <tbody>
                  {topCustomers.map((c, i) => (
                    <tr key={i} className="border-b border-border hover:bg-muted/50">
                      <td className="px-4 py-3 font-bold text-primary">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">{c.count}</td>
                      <td className="px-4 py-3">{c.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.count > 0 ? Math.round(c.total / c.count).toLocaleString() : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">إجمالي المخزون</p>
                <p className="text-2xl font-bold text-foreground">{productStats.totalStock.toLocaleString()} <span className="text-sm text-muted-foreground">وحدة</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">قيمة المخزون (شراء)</p>
                <p className="text-2xl font-bold text-primary">{productStats.totalStockValue.toLocaleString()} </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">منتجات تحت الحد الأدنى</p>
                <p className="text-2xl font-bold text-destructive">{productStats.lowStock.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Top products by stock value */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">أعلى المنتجات قيمة في المخزون</CardTitle></CardHeader>
            <CardContent>
              {productStats.topByValue.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">لا توجد منتجات</p> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={productStats.topByValue.map((p: any) => ({ name: p.name?.substring(0, 20), value: (p.stock_quantity || 0) * (p.sale_price || 0) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" fontSize={10} tick={{ fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={60} />
                    <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="القيمة" fill={COLORS[5]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Low stock alert table */}
          {productStats.lowStock.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle size={16} className="text-destructive" />
                  تنبيهات المخزون المنخفض
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted">
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المنتج</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الكمية الحالية</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الحد الأدنى</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الحالة</th>
                  </tr></thead>
                  <tbody>
                    {productStats.lowStock.map((p: any, i: number) => (
                      <tr key={i} className="border-b border-border hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-destructive font-bold">{p.stock_quantity}</td>
                        <td className="px-4 py-3">{p.min_stock}</td>
                        <td className="px-4 py-3">
                          <Badge variant={p.stock_quantity === 0 ? "destructive" : "secondary"}>
                            {p.stock_quantity === 0 ? "نفد" : "منخفض"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* All products stock table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">جدول المخزون التفصيلي (أعلى 10)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted">
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">المنتج</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الكمية</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">سعر الشراء</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">سعر البيع</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">قيمة المخزون</th>
                  </tr></thead>
                  <tbody>
                    {productStats.topByValue.map((p: any, i: number) => (
                      <tr key={i} className="border-b border-border hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3">{(p.stock_quantity || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">{(p.purchase_price || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">{(p.sale_price || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-primary">{((p.stock_quantity || 0) * (p.sale_price || 0)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
