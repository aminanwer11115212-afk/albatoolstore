import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
const ACTION_LABELS: Record<string, string> = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" };
const ACTION_CLS: Record<string, string> = { INSERT: "st-paid", UPDATE: "st-sent", DELETE: "st-due" };
const TABLE_LABELS: Record<string, string> = {
  invoices: "فواتير", invoice_items: "بنود فواتير", quotes: "عروض أسعار", quote_items: "بنود عروض",
  customers: "عملاء", products: "منتجات", transactions: "حركات مالية", stock_returns: "مرتجعات", suppliers: "موردون",
};

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTable, setFilterTable] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);

  const load = async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (filterTable !== "all") q = q.eq("table_name", filterTable);
    if (filterAction !== "all") q = q.eq("action", filterAction);
    const { data } = await q;
    setLogs((data || []).slice(0, limit));
    setLoading(false);
  };

  useEffect(() => { load();   }, [filterTable, filterAction, limit]);

  const filtered = logs.filter((l) => !search.trim() || startsWithMatch(JSON.stringify(l.new_data || l.old_data || {}), search));

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>سجل النشاط الشامل ({filtered.length})</h5>
        <hr />
        <div className="legacy-form-horizontal" style={{ marginBottom: "1rem" }}>
          <div className="legacy-form-row">
            <label className="legacy-form-label">الجدول</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={filterTable} onChange={(e) => setFilterTable(e.target.value)}>
                <option value="all">الكل</option>
                {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">العملية</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
                <option value="all">الكل</option><option value="INSERT">إضافة</option><option value="UPDATE">تعديل</option><option value="DELETE">حذف</option>
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">بحث</label>
            <div className="legacy-form-control-wrap"><input className="legacy-control" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">عدد السجلات</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
                <option value="50">50</option><option value="100">100</option><option value="250">250</option><option value="500">500</option>
              </select>
            </div>
          </div>
        </div>

        <table className="legacy-table">
          <thead><tr><th>العملية</th><th>الجدول</th><th>السجل</th><th>الحقول</th><th>التاريخ</th><th>تفاصيل</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ textAlign: "center" }}>جاري التحميل...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center" }}>لا توجد سجلات</td></tr>
            : filtered.map((log, i) => {
              const open = expanded === log.id;
              return (
                <>
                  <tr key={log.id} className={i % 2 === 0 ? "odd" : "even"}>
                    <td><span className={ACTION_CLS[log.action] || "st-pending"}>{ACTION_LABELS[log.action] || log.action}</span></td>
                    <td>{TABLE_LABELS[log.table_name] || log.table_name}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{log.record_id?.slice(0, 8) || "—"}</td>
                    <td>{(log.changed_fields || []).length}</td>
                    <td style={{ fontSize: 11 }}>{new Date(log.created_at).toLocaleString("ar-EG")}</td>
                    <td><button onClick={() => setExpanded(open ? null : log.id)} className="btn-xs btn-info">{open ? "إخفاء" : "عرض"}</button></td>
                  </tr>
                  {open && (
                    <tr key={log.id + "-d"}>
                      <td colSpan={6} style={{ background: "hsl(var(--muted) / 0.4)", padding: 12 }}>
                        {(log.changed_fields || []).length > 0 && (
                          <table className="legacy-table" style={{ marginBottom: 8 }}>
                            <thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead>
                            <tbody>
                              {log.changed_fields.map((f: string) => (
                                <tr key={f}><td>{f}</td><td style={{ color: "#a94442" }}>{String(log.old_data?.[f] ?? "—")}</td><td style={{ color: "#3c763d" }}>{String(log.new_data?.[f] ?? "—")}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <details><summary style={{ cursor: "pointer", fontSize: 12 }}>JSON كامل</summary>
                          <pre style={{ fontSize: 10, background: "hsl(var(--card))", padding: 8, overflow: "auto" }}>{JSON.stringify({ old: log.old_data, new: log.new_data }, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
