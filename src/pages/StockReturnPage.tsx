import { useState } from "react";
import ZoomControls from "@/components/ZoomControls";
import { useNavigate } from "react-router-dom";
import { useStockReturns, useCompanySettings } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import { MobileDocCard, mobileDocListCSS } from "@/components/mobile/MobileDocList";
import { StatusChip } from "@/components/ui/status-chip";

function useReturnsFullList() {
  return useQuery({
    queryKey: ["stock-returns-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_returns")
        .select("*, customers(name, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export default function StockReturnPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const { data: returns, isLoading } = useReturnsFullList();
  const { remove } = useStockReturns();
  const { data: companyArr } = useCompanySettings();
  const company = companyArr?.[0] || null;
  const currency = company?.currency || "SDG";

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المرتجع؟")) return;
    try { await remove.mutateAsync(id); toast.success("تم حذف المرتجع"); }
    catch (e: any) { toast.error(e.message); }
  };

  const filtered = (returns || []).filter((r: any) => {
    if (statusFilter !== "all" && (r.status || "pending") !== statusFilter) return false;
    if (customerSearch.trim()) {
      if (!startsWithMatch(r.customers?.name, customerSearch)) return false;
    }
    if (dateFrom && (r.date || "") < dateFrom) return false;
    if (dateTo && (r.date || "") > dateTo) return false;
    if (minAmount.trim()) {
      const min = Number(minAmount) || 0;
      if (Number(r.total || 0) < min) return false;
    }
    if (!search) return true;
    return startsWithAny([r.return_number, r.customers?.name, r.reason], search);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start = (page - 1) * perPage;
  const paginated = filtered.slice(start, start + perPage);

  const fmtDate = (d?: string) => {
    if (!d) return "-";
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return d;
  };
  const fmtMoney = (n: any) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <article className="content returns-compact">
      <style>{`
        .returns-compact { font-size: 11px; }
        .returns-compact .legacy-card { padding: 6px; }
        .returns-compact h5 { font-size: 13px; margin: 4px 0; display: flex; align-items: center; justify-content: space-between; }
        .returns-compact hr { margin: 4px 0; }
        .returns-compact .legacy-dt-toolbar { font-size: 11px; gap: 8px; padding: 4px 0; }
        .returns-compact .legacy-dt-toolbar input,
        .returns-compact .legacy-dt-toolbar select { height: 24px; font-size: 11px; padding: 2px 6px; }
        .returns-compact .legacy-table { font-size: 11px; }
        .returns-compact .legacy-table th { padding: 5px 6px; font-size: 11px; }
        .returns-compact .legacy-table td { padding: 3px 6px; }
        .returns-compact .btn-xs { padding: 2px 6px; font-size: 10px; height: 22px; line-height: 18px; }
        .returns-compact .legacy-actions { gap: 3px; }
        .returns-compact .legacy-pagination .page-link { padding: 2px 8px; font-size: 11px; }
        .returns-compact .legacy-dt-info { font-size: 11px; padding: 4px 0; }
        .returns-compact .st-draft, .returns-compact .st-pending, .returns-compact .st-sent,
        .returns-compact .st-accepted, .returns-compact .st-rejected { padding: 1px 6px; font-size: 10px; }
        ${mobileDocListCSS}
      `}</style>
      <div className="legacy-card">
        <div className="grid_3 grid_4 table-responsive">
          <h5>
            <span>المرتجعات</span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <ZoomControls />
              <button
                type="button"
                className="btn-xs btn-primary"
                onClick={() => navigate("/stock-return/create")}
              >
                + إضافة مرتجع
              </button>
            </span>
          </h5>
          <hr />

          <div className="legacy-dt-toolbar desktop-toolbar">
            <label>
              عرض
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              سجل
            </label>
            <label>
              العميل:
              <input
                type="search"
                placeholder="ابحث باسم العميل..."
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setPage(1); }}
              />
            </label>
            <label>
              الحالة:
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="all">الكل</option>
                <option value="pending">معلق</option>
                <option value="completed">مكتمل</option>
                <option value="cancelled">ملغي</option>
              </select>
            </label>
            <label>
              من:
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
            </label>
            <label>
              إلى:
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
            </label>
            <label>
              مبلغ ≥:
              <input type="number" placeholder="0" value={minAmount}
                onChange={e => { setMinAmount(e.target.value); setPage(1); }}
                style={{ width: 90 }} />
            </label>
            <label>
              بحث:
              <input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </label>
          </div>

          <div className="desktop-table-wrap" style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto", border: "1px solid hsl(var(--border))", borderRadius: 4 }}>
          <table className="legacy-table" cellSpacing={0} width="100%">
            <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--card))" }}>
              <tr>
                <th style={{ width: 40 }}>رقم</th>
                <th style={{ width: 110 }}># المرتجع</th>
                <th>العميل</th>
                <th style={{ width: 110 }}>التاريخ</th>
                <th style={{ width: 140 }}>الإجمالي</th>
                <th style={{ width: 80 }}>الحالة</th>
                <th>السبب</th>
                <th style={{ width: 180 }}>إعدادات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 30 }}>Processing...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 30 }}>لا توجد مرتجعات</td></tr>
              ) : paginated.map((r: any, idx: number) => {
                const rowCls = (start + idx) % 2 === 0 ? "odd" : "even";
                return (
                  <tr key={r.id} className={rowCls}>
                    <td>{start + idx + 1}</td>
                    <td>{r.return_number}</td>
                    <td>{r.customers?.name || "-"}</td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{fmtMoney(r.total)} {currency}</td>
                    <td><StatusChip kind="return" value={r.status || "pending"} /></td>
                    <td>{r.reason || "-"}</td>
                    <td>
                      <span className="legacy-actions">
                        <button
                          type="button"
                          className="btn-xs btn-success"
                          title="عرض"
                          onClick={() => navigate(`/stock-return/view/${r.id}`)}
                        >
                          📄 عرض
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-warning"
                          title="تعديل"
                          onClick={() => navigate(`/stock-return/edit/${r.id}`)}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-info"
                          title="طباعة"
                          onClick={() => navigate(`/preview/return/${r.id}`)}
                        >
                          🖨
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-danger"
                          title="حذف"
                          onClick={() => handleDelete(r.id)}
                        >
                          🗑
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>

          {/* Mobile cards list */}
          <div className="mobile-doc-list">
            {isLoading ? (
              <div style={{ textAlign: "center", padding: 30 }}>Processing...</div>
            ) : paginated.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "hsl(var(--muted-foreground))" }}>لا توجد مرتجعات</div>
            ) : paginated.map((r: any, idx: number) => (
              <MobileDocCard
                key={r.id}
                index={start + idx + 1}
                number={r.return_number}
                party={r.customers?.name || "-"}
                date={fmtDate(r.date)}
                amount={`${fmtMoney(r.total)} ${currency}`}
                status={<StatusChip kind="return" value={r.status || "pending"} />}
                onOpen={() => navigate(`/stock-return/view/${r.id}`)}
                actions={
                  <>
                    <button className="btn-xs btn-warning" onClick={() => navigate(`/stock-return/edit/${r.id}`)}>✎ تعديل</button>
                    <button className="btn-xs btn-info" onClick={() => navigate(`/preview/return/${r.id}`)} title="طباعة">🖨 طباعة</button>
                    <button className="btn-xs btn-danger" onClick={() => handleDelete(r.id)}>🗑 حذف</button>
                  </>
                }
              />
            ))}
          </div>


          {!isLoading && filtered.length > 0 && (
            <>
              <div className="legacy-dt-info">
                إظهار {start + 1} إلى {Math.min(start + perPage, filtered.length)} من إجمالي {filtered.length} مدخل
              </div>
              <ul className="legacy-pagination">
                <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
                </li>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) p = i + 1;
                  else if (page <= 4) p = i + 1;
                  else if (page >= totalPages - 3) p = totalPages - 6 + i;
                  else p = page - 3 + i;
                  return (
                    <li key={p} className={`page-item ${page === p ? "active" : ""}`}>
                      <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                    </li>
                  );
                })}
                <li className={`page-item ${page === totalPages ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>التالي</button>
                </li>
              </ul>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
