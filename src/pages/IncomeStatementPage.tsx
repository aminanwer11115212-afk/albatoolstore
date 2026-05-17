import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getBaseCurrency, getLatestRate } from "@/utils/currency";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";
import type { FinancialReportData } from "@/utils/financialReportPrintTemplate";

export default function IncomeStatementPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<any>({ income: [], expenses: [], totalIncome: 0, totalExpenses: 0 });
  const [baseSymbol, setBaseSymbol] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const base = await getBaseCurrency();
    setBaseSymbol(base?.symbol || base?.code || "");
    const { data: tx } = await (supabase as any).from("transactions").select("type, amount, category, date, currency_code, exchange_rate_to_base").gte("date", from).lte("date", to);
    const list = tx || [];
    const needed = Array.from(new Set(list.filter((t: any) => t.currency_code && !t.exchange_rate_to_base).map((t: any) => t.currency_code)));
    const rateCache: Record<string, number> = {};
    await Promise.all(needed.map(async (code: any) => { rateCache[code] = await getLatestRate(code); }));

    const incomeMap: Record<string, number> = {};
    const expenseMap: Record<string, number> = {};
    let totalIncome = 0, totalExpenses = 0;
    list.forEach((t: any) => {
      const cat = t.category || "بدون تصنيف";
      const rate = Number(t.exchange_rate_to_base || rateCache[t.currency_code] || 1);
      const amt = Number(t.amount || 0) * rate;
      if (t.type === "income") { incomeMap[cat] = (incomeMap[cat] || 0) + amt; totalIncome += amt; }
      else if (t.type === "expense") { expenseMap[cat] = (expenseMap[cat] || 0) + amt; totalExpenses += amt; }
    });
    setData({
      income: Object.entries(incomeMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      expenses: Object.entries(expenseMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      totalIncome, totalExpenses,
    });
    setLoading(false);
  };

  useEffect(() => { load();   }, []);

  const net = data.totalIncome - data.totalExpenses;
  const fmt = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${baseSymbol}`.trim();

  const sections = [
    { key: "header", label: "الترويسة" },
    { key: "filters", label: "الفلاتر" },
    { key: "income", label: "الإيرادات" },
    { key: "expenses", label: "المصروفات" },
    { key: "net", label: "صافي الدخل" },
  ];

  const openPreview = async () => {
    const { data: comp } = await (supabase as any).from("company_settings").select("*").maybeSingle();
    const payload: FinancialReportData = {
      title: `قائمة الدخل ${baseSymbol ? `(${baseSymbol})` : ""}`.trim(),
      fromDate: from,
      toDate: to,
      company: comp || null,
      currency: baseSymbol,
      summary: [
        { label: "الإيرادات", value: data.totalIncome, color: "green" },
        { label: "المصروفات", value: data.totalExpenses, color: "red" },
        { label: "صافي الدخل", value: net, color: net >= 0 ? "green" : "red" },
      ],
      sections: [
        {
          key: "income", label: "الإيرادات",
          columns: [{ key: "category", label: "التصنيف", align: "right" }, { key: "amount", label: `المبلغ ${baseSymbol}`, numeric: true }],
          rows: data.income, headerColor: "#16a34a",
          totals: { category: "الإجمالي", amount: data.totalIncome },
        },
        {
          key: "expenses", label: "المصروفات",
          columns: [{ key: "category", label: "التصنيف", align: "right" }, { key: "amount", label: `المبلغ ${baseSymbol}`, numeric: true }],
          rows: data.expenses, headerColor: "#dc2626",
          totals: { category: "الإجمالي", amount: data.totalExpenses },
        },
      ],
    };
    sessionStorage.setItem("lov_financial_report_preview", JSON.stringify(payload));
    navigate("/reports/financial-preview");
  };

  return (
    <article className="content">
      <PrintVisibilityToolbar
        storageKey="income-statement"
        containerSelector=".printable-statement"
        sections={sections}
        shareTitle={`قائمة الدخل ${baseSymbol ? `(${baseSymbol})` : ""}`}
        shareSummary={`الإيرادات: ${fmt(data.totalIncome)} | المصروفات: ${fmt(data.totalExpenses)} | الصافي: ${fmt(net)}`}
        pdfFilename="قائمة-الدخل"
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={openPreview} className="legacy-btn legacy-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Eye size={16} /> معاينة وطباعة
        </button>
      </div>
      <div className="printable-statement legacy-card card-block">
        <ReportPrintHeader
          title={`قائمة الدخل ${baseSymbol ? `(${baseSymbol})` : ""}`}
          periodText={`من ${from} إلى ${to}`}
        />
        <div data-section="filters" data-section-label="الفلاتر" className="legacy-form-horizontal" style={{ marginBottom: "1rem" }}>
          <div className="legacy-form-row"><label className="legacy-form-label">من</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={from} onChange={(e) => setFrom(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">إلى</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={load} disabled={loading} className="legacy-btn legacy-btn-success">{loading ? "..." : "عرض"}</button></div></div>
        </div>

        <div data-section="income" data-section-label="الإيرادات">
          <h5>الإيرادات — {fmt(data.totalIncome)}</h5>
          <hr />
          <table className="legacy-table">
            <thead><tr><th>التصنيف</th><th>المبلغ</th></tr></thead>
            <tbody>
              {data.income.length === 0 ? <tr><td colSpan={2} style={{ textAlign: "center" }}>لا توجد إيرادات</td></tr>
              : data.income.map((r: any, i: number) => <tr key={r.category} className={i % 2 === 0 ? "odd" : "even"}><td>{r.category}</td><td>{fmt(r.amount)}</td></tr>)}
            </tbody>
          </table>
        </div>

        <div data-section="expenses" data-section-label="المصروفات">
          <h5 style={{ marginTop: "1.5rem" }}>المصروفات — {fmt(data.totalExpenses)}</h5>
          <hr />
          <table className="legacy-table">
            <thead><tr><th>التصنيف</th><th>المبلغ</th></tr></thead>
            <tbody>
              {data.expenses.length === 0 ? <tr><td colSpan={2} style={{ textAlign: "center" }}>لا توجد مصروفات</td></tr>
              : data.expenses.map((r: any, i: number) => <tr key={r.category} className={i % 2 === 0 ? "odd" : "even"}><td>{r.category}</td><td>{fmt(r.amount)}</td></tr>)}
            </tbody>
          </table>
        </div>

        <div data-section="net" data-section-label="صافي الدخل" className={`legacy-alert ${net >= 0 ? "legacy-alert-success" : "legacy-alert-danger"}`} style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>صافي الدخل</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{fmt(net)}</span>
        </div>
      </div>
    </article>
  );
}
