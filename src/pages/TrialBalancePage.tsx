import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getBaseCurrency, getLatestRate } from "@/utils/currency";

export default function TrialBalancePage() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split("T")[0]; });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);
  const [accountFilter, setAccountFilter] = useState("");
  const [accountsList, setAccountsList] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [baseSymbol, setBaseSymbol] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("accounts").select("id, name");
      setAccountsList(data || []);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const base = await getBaseCurrency();
    setBaseSymbol(base?.symbol || base?.code || "");
    const accountsQ = accountFilter
      ? (supabase as any).from("accounts").select("id, name, account_type, balance").eq("id", accountFilter)
      : (supabase as any).from("accounts").select("id, name, account_type, balance");
    const [accountsRes, openingRes, periodRes] = await Promise.all([
      accountsQ,
      (supabase as any).from("transactions").select("account_id, to_account_id, type, amount, debit, credit, date, currency_code, exchange_rate_to_base").lt("date", from),
      (supabase as any).from("transactions").select("account_id, to_account_id, type, amount, debit, credit, date, currency_code, exchange_rate_to_base").gte("date", from).lte("date", to),
    ]);
    const accounts = accountsRes.data || [];
    const opening = openingRes.data || [];
    const period = periodRes.data || [];
    const allTx = [...opening, ...period];
    const needed = Array.from(new Set(allTx.filter((t: any) => t.currency_code && !t.exchange_rate_to_base).map((t: any) => t.currency_code)));
    const rateCache: Record<string, number> = {};
    await Promise.all(needed.map(async (code: any) => { rateCache[code] = await getLatestRate(code); }));

    const computeFor = (acc: any, txList: any[]) => {
      let debit = 0, credit = 0;
      txList.forEach((t: any) => {
        const rate = Number(t.exchange_rate_to_base || rateCache[t.currency_code] || 1);
        const amt = Number(t.amount || 0) * rate;
        const d = Number(t.debit || 0) * rate;
        const c = Number(t.credit || 0) * rate;
        if (t.account_id === acc.id) {
          if (d || c) { debit += d; credit += c; }
          else if (t.type === "income" || t.type === "deposit") credit += amt;
          else if (t.type === "expense" || t.type === "withdrawal") debit += amt;
          else if (t.type === "transfer") credit += amt;
        }
        if (t.to_account_id === acc.id && t.type === "transfer") debit += amt;
      });
      return { debit, credit };
    };

    const result = accounts.map((acc: any) => {
      const op = computeFor(acc, opening);
      const pe = computeFor(acc, period);
      const opening_balance = op.debit - op.credit;
      const closing_balance = opening_balance + (pe.debit - pe.credit);
      return { ...acc, opening_balance, debit: pe.debit, credit: pe.credit, closing_balance };
    });
    setRows(result);
    setLoading(false);
  };

  useEffect(() => { load();   }, []);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalOpening = rows.reduce((s, r) => s + r.opening_balance, 0);
  const totalClosing = rows.reduce((s, r) => s + r.closing_balance, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>ميزان المراجعة {baseSymbol && `(${baseSymbol})`}</h5>
        <div
          className="legacy-alert legacy-alert-info"
          style={{ marginBottom: 8, fontSize: 13 }}
        >
          ℹ️ يعتمد على حركات «المعاملات» على <strong>الأساس النقدي</strong>.
          الفواتير والمشتريات غير المدفوعة لا تُدرَج كالتزامات هنا — راجع
          تقرير المبالغ المستحقة وكشوف الموردين للذمم المعلَّقة.
        </div>
        <hr />
        <div className="legacy-form-horizontal" style={{ marginBottom: "1rem" }}>
          <div className="legacy-form-row"><label className="legacy-form-label">من</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={from} onChange={(e) => setFrom(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">إلى</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">الحساب</label><div className="legacy-form-control-wrap"><select className="legacy-control" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}><option value="">جميع الحسابات</option>{accountsList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={load} disabled={loading} className="legacy-btn legacy-btn-success">{loading ? "..." : "عرض"}</button>{" "}<button onClick={() => window.print()} className="legacy-btn legacy-btn-info">طباعة</button></div></div>
        </div>

        <table className="legacy-table">
          <thead><tr><th>الحساب</th><th>النوع</th><th>رصيد افتتاحي</th><th>مدين</th><th>دائن</th><th>رصيد ختامي</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center" }}>لا توجد بيانات</td></tr>
            : rows.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td>{r.name}</td>
                <td>{r.account_type || "—"}</td>
                <td>{fmt(r.opening_balance)}</td>
                <td>{fmt(r.debit)}</td>
                <td>{fmt(r.credit)}</td>
                <td>{fmt(r.closing_balance)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ background: "hsl(var(--muted))", fontWeight: 700 }}>
                <td colSpan={2}>الإجمالي</td>
                <td>{fmt(totalOpening)}</td>
                <td>{fmt(totalDebit)}</td>
                <td>{fmt(totalCredit)}</td>
                <td style={{ color: balanced ? "#3c763d" : "#a94442" }}>{balanced ? `✓ ${fmt(totalClosing)}` : `فرق: ${fmt(totalDebit - totalCredit)}`}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </article>
  );
}
