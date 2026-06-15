import { useState, useMemo } from "react";
import { usePageRenderCount } from "@/hooks/usePageRenderCount";
import { useQuotes, useCompanySettings } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import PrintMenu, { type PrintVariant } from "@/components/PrintMenu";
import { deductStockForLines } from "@/utils/stockDeduction";
import { openWhatsAppMessage } from "@/utils/whatsapp";
import { useQuoteConvertedDialog } from "@/hooks/useQuoteConvertedDialog";
import { MobileDocCard, mobileDocListCSS } from "@/components/mobile/MobileDocList";

export const QUOTE_STATUS_KEYS = ["draft", "sent", "accepted", "rejected"] as const;

export const statusMap: Record<string, { label: string; cls: string }> = {
  draft:    { label: "عرض سعر", cls: "st-draft" },
  sent:     { label: "مرسل",  cls: "st-sent" },
  accepted: { label: "مقبول", cls: "st-accepted" },
  rejected: { label: "مرفوض", cls: "st-rejected" },
};

function useQuotesFullList() {
  return useQuery({
    queryKey: ["quotes-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, customers(name, phone, balance)")
        .or("is_side.is.null,is_side.eq.false")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export default function QuotesPage() {
  usePageRenderCount("/quotes");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showConverted, ConvertedDialog } = useQuoteConvertedDialog();
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const { data: quotes, isLoading } = useQuotesFullList();
  const { remove } = useQuotes();
  const { data: companyArr } = useCompanySettings();
  const company = companyArr?.[0] || null;
  const currency = company?.currency || "SDG";

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العرض؟")) return;
    try { await remove.mutateAsync(id); toast.success("تم حذف العرض"); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleSendQuote = async (q: any, channel: "whatsapp" | "email" | "sms") => {
    const phone = q.customers?.phone;
    const email = q.customers?.email;
    const cur = q.currency_code || currency;
    if (channel === "whatsapp") {
      if (!phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
      openWhatsAppMessage(phone, "invoice_notification", {
        invoice_number: q.quote_number, total: q.total || 0,
        paid_amount: 0, due_amount: q.total || 0,
        date: q.date, customerName: q.customers?.name, currency: cur,
      });
    } else if (channel === "email") {
      if (!email) { toast.error("لا يوجد بريد إلكتروني للعميل"); return; }
      const subject = encodeURIComponent(`عرض سعر رقم ${q.quote_number}`);
      const body = encodeURIComponent(`عزيزي ${q.customers?.name || "العميل"},\n\nمرفق عرض سعر رقم ${q.quote_number} بمبلغ ${cur} ${Number(q.total || 0).toLocaleString()}.`);
      window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    } else {
      if (!phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
      const msg = encodeURIComponent(`عرض سعر ${q.quote_number} بمبلغ ${cur} ${Number(q.total || 0).toLocaleString()}`);
      window.open(`sms:${phone}?body=${msg}`);
    }
    const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
    await markQuoteAsSent(q.id);
    qc.invalidateQueries({ queryKey: ["quotes-full"] });
  };

  const handleConvertToInvoice = async (q: any) => {
    if (!confirm(`تحويل العرض ${q.quote_number} إلى فاتورة؟ سيتم الإبقاء على العرض بحالة "مقبول".`)) return;
    try {
      const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
      const { invoiceId, invoiceNumber } = await convertQuoteToInvoice(q.id);
      toast.success(`تم تحويل العرض إلى فاتورة ${invoiceNumber} — العرض محفوظ كمقبول`);
      qc.invalidateQueries({ queryKey: ["quotes-full"] });
      qc.invalidateQueries({ queryKey: ["invoices-full"] });
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      navigate(`/invoices/edit/${invoiceId}`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePrint = async (q: any, variant: PrintVariant = "full", noHeader: boolean = false) => {
    // الانتقال لصفحة المعاينة الداخلية بدلاً من فتح نافذة منبثقة
    const qs = new URLSearchParams();
    if (variant !== "full") qs.set("variant", variant);
    if (noHeader) qs.set("noHeader", "1");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    navigate(`/preview/quote/${q.id}${suffix}`);
    const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
    await markQuoteAsSent(q.id);
    qc.invalidateQueries({ queryKey: ["quotes-full"] });
  };

  const filtered = useMemo(() => (quotes || []).filter((q: any) => {
    if (statusFilter !== "all" && (q.status || "draft") !== statusFilter) return false;
    if (customerSearch.trim()) {
      if (!startsWithMatch(q.customers?.name, customerSearch)) return false;
    }
    if (dateFrom && (q.date || "") < dateFrom) return false;
    if (dateTo && (q.date || "") > dateTo) return false;
    if (minAmount.trim()) {
      const min = Number(minAmount) || 0;
      if (Number(q.total || 0) < min) return false;
    }
    if (!search) return true;
    return startsWithAny([q.quote_number, q.customers?.name], search);
  }), [quotes, statusFilter, customerSearch, dateFrom, dateTo, minAmount, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start = (page - 1) * perPage;
  const paginated = useMemo(() => filtered.slice(start, start + perPage), [filtered, start, perPage]);

  const fmtDate = (d?: string) => {
    if (!d) return "-";
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return d;
  };
  const fmtMoney = (n: any) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <article className="content quotes-compact">
      <style>{`
        .quotes-compact { font-size: 11px; }
        .quotes-compact .legacy-card { padding: 6px; }
        .quotes-compact h5 { font-size: 13px; margin: 4px 0; }
        .quotes-compact hr { margin: 4px 0; }
        .quotes-compact .legacy-dt-toolbar { font-size: 11px; gap: 8px; padding: 4px 0; }
        .quotes-compact .legacy-dt-toolbar input,
        .quotes-compact .legacy-dt-toolbar select { height: 24px; font-size: 11px; padding: 2px 6px; }
        .quotes-compact .legacy-table { font-size: 11px; }
        .quotes-compact .legacy-table th { padding: 5px 6px; font-size: 11px; }
        .quotes-compact .legacy-table td { padding: 3px 6px; }
        .quotes-compact .btn-xs { padding: 2px 6px; font-size: 10px; height: 22px; line-height: 18px; }
        .quotes-compact .legacy-actions { gap: 3px; }
        .quotes-compact .legacy-pagination .page-link { padding: 2px 8px; font-size: 11px; }
        .quotes-compact .legacy-dt-info { font-size: 11px; padding: 4px 0; }
        .quotes-compact .st-draft, .quotes-compact .st-pending, .quotes-compact .st-sent,
        .quotes-compact .st-accepted, .quotes-compact .st-rejected { padding: 1px 6px; font-size: 10px; }
        ${mobileDocListCSS}
      `}</style>
      <div className="legacy-card">
        <div className="grid_3 grid_4 table-responsive">
          <h5>عروض الأسعار</h5>
          <hr />

          {/* Mobile toolbar */}
          <div className="mobile-toolbar">
            <input
              type="search"
              placeholder="بحث في العروض أو العميل..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
              <option value={10}>10 لكل صفحة</option>
              <option value={25}>25 لكل صفحة</option>
              <option value={50}>50 لكل صفحة</option>
            </select>
          </div>

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
                <option value="draft">عرض سعر</option>
                <option value="sent">مرسل</option>
                <option value="accepted">مقبول</option>
                <option value="rejected">مرفوض</option>
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

          <div className="desktop-table-wrap" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto", border: "1px solid hsl(var(--border))", borderRadius: 4 }}>
          <table className="legacy-table" cellSpacing={0} width="100%">
            <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
              <tr>
                <th style={{ width: 40 }}>رقم</th>
                <th style={{ width: 80 }}># عرض</th>
                <th>العميل</th>
                <th style={{ width: 110 }}>تاريخ</th>
                
                <th style={{ width: 140 }}>مبلغ</th>
                <th style={{ width: 80 }}>الحالة</th>
                <th style={{ width: 110 }}>المستخدم</th>
                <th style={{ width: 240 }}>إعدادات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 30 }}>Processing...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 30 }}>لا توجد عروض أسعار</td></tr>
              ) : paginated.map((q: any, idx: number) => {
                const st = statusMap[q.status || "draft"] || statusMap.draft;
                const rowCls = (start + idx) % 2 === 0 ? "odd" : "even";
                const note = (q.user_note || q.internal_note || "").trim();
                return (
                  <tr key={q.id} className={rowCls}>
                    <td>{start + idx + 1}</td>
                    <td>{q.quote_number}</td>
                    <td>{q.customers?.name || "-"}</td>
                    <td>{fmtDate(q.date)}</td>
                    
                    <td>{fmtMoney(q.total)} {q.currency_code || currency}</td>
                    <td><span className={st.cls}>{st.label}</span></td>
                    <td>{q.created_by || ""}</td>
                    <td>
                      <span className="legacy-actions">
                        <button
                          type="button"
                          className="btn-xs btn-warning"
                          title={note ? "تعديل مذكرة" : "اضف ملاحظة"}
                          onClick={() => {
                            const v = prompt("ملاحظة:", note);
                            if (v === null) return;
                            supabase.from("quotes").update({ user_note: v }).eq("id", q.id)
                              .then(({ error }) => error ? toast.error(error.message) : toast.success("تم الحفظ"));
                          }}
                        >
                          {note ? "✎" : "+"}
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-success"
                          onClick={() => navigate(`/quotes/view/${q.id}`)}
                          title="عرض"
                        >
                          📄 عرض
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-warning"
                          onClick={() => navigate(`/quotes/edit/${q.id}`)}
                          title="تعديل"
                        >
                          ✎ تعديل
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-info"
                          title="طباعة"
                          onClick={() => handlePrint(q, "full", false)}
                        >
                          🖨 طباعة
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-primary"
                          onClick={() => handleConvertToInvoice(q)}
                          title="تحويل لفاتورة"
                        >
                          → فاتورة
                        </button>
                        <details className="legacy-send-menu" style={{ position: "relative", display: "inline-block" }}>
                          <summary className="btn-xs btn-info" style={{ cursor: "pointer", listStyle: "none" }} title="إرسال">
                            ✉ إرسال
                          </summary>
                          <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 50, background: "#fff", border: "1px solid #ddd", borderRadius: 4, minWidth: 130, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                            <button
                              type="button"
                              style={{ display: "block", width: "100%", padding: "6px 10px", textAlign: "right", border: 0, background: "transparent", cursor: "pointer", fontSize: 12 }}
                              onClick={() => handleSendQuote(q, "whatsapp")}
                            >
                              💬 واتساب
                            </button>
                            <button
                              type="button"
                              style={{ display: "block", width: "100%", padding: "6px 10px", textAlign: "right", border: 0, background: "transparent", cursor: "pointer", fontSize: 12 }}
                              onClick={() => handleSendQuote(q, "email")}
                            >
                              ✉ Email
                            </button>
                            <button
                              type="button"
                              style={{ display: "block", width: "100%", padding: "6px 10px", textAlign: "right", border: 0, background: "transparent", cursor: "pointer", fontSize: 12 }}
                              onClick={() => handleSendQuote(q, "sms")}
                            >
                              📱 SMS
                            </button>
                          </div>
                        </details>
                        <button
                          type="button"
                          className="btn-xs btn-danger"
                          onClick={() => handleDelete(q.id)}
                          title="حذف"
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
              <div style={{ textAlign: "center", padding: 30, color: "hsl(var(--muted-foreground))" }}>لا توجد عروض أسعار</div>
            ) : paginated.map((q: any, idx: number) => {
              const st = statusMap[q.status || "draft"] || statusMap.draft;
              return (
                <MobileDocCard
                  key={q.id}
                  index={start + idx + 1}
                  number={q.quote_number}
                  party={q.customers?.name || "-"}
                  date={fmtDate(q.date)}
                  amount={`${fmtMoney(q.total)} ${q.currency_code || currency}`}
                  status={<span className={st.cls}>{st.label}</span>}
                  onOpen={() => navigate(`/quotes/view/${q.id}`)}
                  actions={
                    <>
                      <button className="btn-xs btn-warning" onClick={() => navigate(`/quotes/edit/${q.id}`)}>✎ تعديل</button>
                      <button className="btn-xs btn-info" onClick={() => handlePrint(q, "full", false)} title="طباعة">🖨 طباعة</button>
                      <button className="btn-xs btn-primary" onClick={() => handleConvertToInvoice(q)}>→ فاتورة</button>
                      <button className="btn-xs btn-danger" onClick={() => handleDelete(q.id)}>🗑 حذف</button>
                    </>
                  }
                />
              );
            })}
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
      {ConvertedDialog}
    </article>
  );
}
