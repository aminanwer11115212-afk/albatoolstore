import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";
import type { FinancialReportData } from "@/utils/financialReportPrintTemplate";

export default function ExpenseStatementPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("");
  const [category, setCategory] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [groups, setGroups] = useState<Record<string, { total: number; items: any[] }>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [a, c] = await Promise.all([
        (supabase as any).from("accounts").select("id, name"),
        (supabase as any).from("transaction_categories").select("id, name"),
      ]);
      setAccounts(a.data || []); setCategories(c.data || []);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from("transactions").select("id, date, description, amount, category, method, account_id, accounts(name)").eq("type", "expense").gte("date", from).lte("date", to).order("date", { ascending: false });
    if (accountId) q = q.eq("account_id", accountId);
    if (method) q = q.eq("method", method);
    if (category) q = q.eq("category", category);
    const { data } = await q;
    const list = data || [];
    const grouped: Record<string, { total: number; items: any[] }> = {};
    let sum = 0;
    list.forEach((r: any) => {
      const cat = r.category || "بدون تصنيف";
      const amt = Number(r.amount || 0);
      if (!grouped[cat]) grouped[cat] = { total: 0, items: [] };
      grouped[cat].total += amt; grouped[cat].items.push(r); sum += amt;
    });
    setGroups(grouped); setTotal(sum); setLoading(false);
  };

  useEffect(() => { load();   }, []);

  const sections = [
    { key: "header", label: "الترويسة" },
    { key: "filters", label: "الفلاتر" },
    { key: "totalAlert", label: "إجمالي المصروفات" },
    { key: "groups", label: "المجموعات التفصيلية" },
  ];

  const openPreview = async () => {
    const { data: comp } = await (supabase as any).from("company_settings").select("*").maybeSingle();
    const sectionsForPreview = Object.entries(groups)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([cat, g]) => ({
        key: `cat-${cat}`,
        label: `${cat} — ${g.total.toLocaleString()}`,
        columns: [
          { key: "date", label: "التاريخ", align: "center" as const },
          { key: "description", label: "الوصف", align: "right" as const },
          { key: "account", label: "الحساب", align: "center" as const },
          { key: "method", label: "الطريقة", align: "center" as const },
          { key: "amount", label: "المبلغ", numeric: true },
        ],
        rows: g.items.map((r: any) => ({
          date: r.date, description: r.description || "—",
          account: r.accounts?.name || "—", method: r.method || "—",
          amount: Number(r.amount || 0),
        })),
        totals: { date: "الإجمالي", amount: g.total },
        headerColor: "#dc2626",
      }));
    const payload: FinancialReportData = {
      title: "تقرير المصروفات التفصيلي",
      fromDate: from, toDate: to,
      company: comp || null,
      summary: [{ label: "إجمالي المصروفات", value: total, color: "red" }],
      sections: sectionsForPreview,
    };
    sessionStorage.setItem("lov_financial_report_preview", JSON.stringify(payload));
    navigate("/reports/financial-preview");
  };

  return (
    <article className="content">
      <PrintVisibilityToolbar
        storageKey="expense-statement"
        containerSelector=".printable-statement"
        sections={sections}
        shareTitle="تقرير المصروفات التفصيلي"
        shareSummary={`الإجمالي: ${total.toLocaleString()}`}
        pdfFilename="تقرير-المصروفات"
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={openPreview} className="legacy-btn legacy-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Eye size={16} /> معاينة وطباعة
        </button>
      </div>
      <div className="printable-statement legacy-card card-block">
        <ReportPrintHeader
          title="تقرير المصروفات التفصيلي"
          periodText={`من ${from} إلى ${to}`}
        />
        <div data-section="filters" data-section-label="الفلاتر" className="legacy-form-horizontal" style={{ marginBottom: "1rem" }}>
          <div className="legacy-form-row"><label className="legacy-form-label">من</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={from} onChange={(e) => setFrom(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">إلى</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">الحساب</label><div className="legacy-form-control-wrap"><select className="legacy-control" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">الكل</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">طريقة الدفع</label><div className="legacy-form-control-wrap"><select className="legacy-control" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">الكل</option><option value="cash">نقدي</option><option value="bank">بنك</option><option value="check">شيك</option></select></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">التصنيف</label><div className="legacy-form-control-wrap"><select className="legacy-control" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">الكل</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={load} disabled={loading} className="legacy-btn legacy-btn-success">{loading ? "..." : "تطبيق"}</button></div></div>
        </div>

        <div data-section="totalAlert" data-section-label="إجمالي المصروفات" className="legacy-alert legacy-alert-danger" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>إجمالي المصروفات</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{total.toLocaleString()}</span>
        </div>

        <div data-section="groups" data-section-label="المجموعات التفصيلية">
        {Object.entries(groups).sort((a, b) => b[1].total - a[1].total).map(([cat, g]) => (
          <div key={cat} style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
              <b>{cat}</b>
              <span style={{ color: "#d9534f", fontWeight: 700 }}>{g.total.toLocaleString()}</span>
            </div>
            <table className="legacy-table">
              <thead><tr><th>التاريخ</th><th>الوصف</th><th>الحساب</th><th>الطريقة</th><th>المبلغ</th></tr></thead>
              <tbody>
                {g.items.map((r: any, i: number) => (
                  <tr key={r.id} className={i % 2 === 0 ? "odd" : "even"}>
                    <td>{r.date}</td><td>{r.description || "—"}</td><td>{r.accounts?.name || "—"}</td><td>{r.method || "—"}</td><td>{Number(r.amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        </div>

        {Object.keys(groups).length === 0 && !loading && <div style={{ textAlign: "center", padding: 24, color: "hsl(var(--muted-foreground))" }}>لا توجد مصروفات</div>}
      </div>
    </article>
  );
}
