import { useState, useMemo } from "react";
import { usePageRenderCount } from "@/hooks/usePageRenderCount";
import { useInvoicesWithCustomers, useInvoices, useCompanySettings } from "@/hooks/useData";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { openWhatsAppInvoice } from "@/utils/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import PrintMenu, { type PrintVariant } from "@/components/PrintMenu";
import WorkflowStatusBadge, { WORKFLOW_STATUSES, type WorkflowStatus } from "@/components/invoice/WorkflowStatusBadge";
import { recordInvoiceRevision } from "@/utils/invoiceRevisions";
import { MobileDocCard, mobileDocListCSS } from "@/components/mobile/MobileDocList";
import ShippingDispatchDialog from "@/components/invoice/ShippingDispatchDialog";

// Status label map matching old system (custom.css .st-* classes)
const statusMap: Record<string, { label: string; cls: string }> = {
  paid:      { label: "دفع",     cls: "st-paid" },
  partial:   { label: "جزئي",    cls: "st-partial" },
  pending:   { label: "مستحقة",  cls: "st-due" },
  overdue:   { label: "متأخرة",  cls: "st-overdue" },
  cancelled: { label: "ملغاة",   cls: "st-canceled" },
  draft:     { label: "جديد",   cls: "st-draft" },
};

export default function InvoicesPage() {
  usePageRenderCount("/invoices");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [workflowFilter, setWorkflowFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const { data: invoices, isLoading, refetch } = useInvoicesWithCustomers();
  const { remove } = useInvoices();
  const { data: companyArr } = useCompanySettings();
  const company = companyArr?.[0] || null;
  const currency = company?.currency || "SDG";
  const [showDispatch, setShowDispatch] = useState(false);
  const qc = useQueryClient();

  const handleWhatsApp = (inv: any) => {
    const phone = inv.customers?.phone;
    if (!phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
    openWhatsAppInvoice(phone, {
      invoice_number: inv.invoice_number, total: inv.total || 0,
      paid_amount: inv.paid_amount || 0, due_amount: inv.due_amount || 0,
      date: inv.date, customerName: inv.customers?.name, currency,
    });
  };

  const handlePrint = async (inv: any, variant: PrintVariant = "full", noHeader: boolean = false) => {
    // الانتقال لصفحة المعاينة الداخلية بدلاً من فتح نافذة منبثقة
    const qs = new URLSearchParams();
    if (variant !== "full") qs.set("variant", variant);
    if (noHeader) qs.set("noHeader", "1");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    navigate(`/preview/invoice/${inv.id}${suffix}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الفاتورة؟ سيتم إرجاع الكميات إلى المخزون.")) return;
    try {
      const { deleteInvoiceWithStockRestore } = await import("@/utils/deleteInvoice");
      const { restoredStock } = await deleteInvoiceWithStockRestore(id);
      // إزالة الفاتورة من كاش React Query محلياً
      qc.setQueriesData<any>(
        { predicate: (q) => {
          const key = q.queryKey[0];
          return key === "invoices-with-customers" || key === "invoices";
        }},
        (old: any) => Array.isArray(old) ? old.filter((row: any) => row.id !== id) : old,
      );
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(restoredStock ? "تم حذف الفاتورة وإرجاع الكميات إلى المخزون" : "تم حذف الفاتورة");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حذف الفاتورة");
    }
  };
  const handleWorkflowChange = async (inv: any, newStatus: WorkflowStatus) => {
    if (newStatus === inv.workflow_status) return;
    const before = (inv.workflow_status || "new") as WorkflowStatus;
    // ─── Optimistic: تحديث الشاشة فوراً ───
    const KEYS = [["invoices-with-customers"], ["invoices-with-customers", undefined]];
    const snapshots = KEYS.map(k => ({ k, v: qc.getQueryData(k) }));
    KEYS.forEach(k => qc.setQueryData<any[]>(k as any, (old) =>
      (old || []).map((r: any) => r.id === inv.id ? { ...r, workflow_status: newStatus } : r)
    ));
    try {
      const { error } = await supabase.from("invoices").update({ workflow_status: newStatus }).eq("id", inv.id);
      if (error) throw error;
      // Stock deduction: only when leaving the "new" workflow for the first time
      if (before === "new" && newStatus !== "new") {
        try {
          const { data: items } = await supabase
            .from("invoice_items")
            .select("product_id, quantity")
            .eq("invoice_id", inv.id);
          const { deductStockForInvoiceOnce } = await import("@/utils/stockDeduction");
          await deductStockForInvoiceOnce(
            inv.id,
            (items || []).map((it: any) => ({ product_id: it.product_id, quantity: it.quantity })),
          );
        } catch (stockErr) { console.error("[InvoicesPage] stock deduction failed", stockErr); }
      }
      await recordInvoiceRevision({
        invoiceId: inv.id,
        action: "workflow_status_change",
        changes: { workflow_status: { before, after: newStatus } },
        note: `حالة التجهيز: ${before} → ${newStatus}`,
      });
      toast.success("تم تحديث حالة التجهيز");
      refetch();
    } catch (e: any) {
      // Rollback
      snapshots.forEach(({ k, v }) => qc.setQueryData(k as any, v));
      toast.error(e.message);
    }
  };

  // حالة الدفع المحسوبة من المبلغ المدفوع والإجمالي
  // هامش تسامح 0.01 لمنع أخطاء التقريب (مثلاً 99.999 vs 100)
  const PAY_EPS = 0.01;
  const getPaymentStatus = (inv: any): "unpaid" | "partial" | "paid" => {
    const total = Number(inv.total || 0);
    const paid = Number(inv.paid_amount || 0);
    if (paid <= PAY_EPS) return "unpaid";
    if (total > 0 && paid >= total - PAY_EPS) return "paid";
    return "partial";
  };

  const PAYMENT_META: Record<string, { label: string; cls: string; chipCls: string }> = {
    unpaid:  { label: "غير مدفوع", cls: "bg-red-100 text-red-700 border-red-200",       chipCls: "bg-red-50 text-red-700 border-red-200" },
    partial: { label: "مدفوع جزئي", cls: "bg-yellow-100 text-yellow-800 border-yellow-200", chipCls: "bg-yellow-50 text-yellow-800 border-yellow-200" },
    paid:    { label: "مدفوع",     cls: "bg-green-100 text-green-700 border-green-200",   chipCls: "bg-green-50 text-green-700 border-green-200" },
  };

  // Filter + paginate
  const filtered = useMemo(() => (invoices || []).filter((inv: any) => {
    if (workflowFilter !== "all" && (inv.workflow_status || "new") !== workflowFilter) return false;
    if (paymentFilter !== "all" && getPaymentStatus(inv) !== paymentFilter) return false;
    if (customerSearch.trim()) {
      const cs = customerSearch.trim().toLowerCase();
      if (!(inv.customers?.name || "").toLowerCase().startsWith(cs)) return false;
    }
    if (dateFrom && (inv.date || "") < dateFrom) return false;
    if (dateTo && (inv.date || "") > dateTo) return false;
    if (minAmount.trim()) {
      const min = Number(minAmount) || 0;
      if (Number(inv.total || 0) < min) return false;
    }
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(s) ||
      inv.customers?.name?.toLowerCase().includes(s)
    );
  }), [invoices, workflowFilter, paymentFilter, customerSearch, dateFrom, dateTo, minAmount, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start = (page - 1) * perPage;
  const paginated = useMemo(() => filtered.slice(start, start + perPage), [filtered, start, perPage]);

  // Counts per workflow status
  const counts = useMemo(() => (invoices || []).reduce((acc: Record<string, number>, inv: any) => {
    const k = inv.workflow_status || "new";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {}), [invoices]);

  // Counts per payment status
  const paymentCounts = useMemo(() => (invoices || []).reduce((acc: Record<string, number>, inv: any) => {
    const k = getPaymentStatus(inv);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {}), [invoices]);

  // Format date as dd-mm-yyyy (like old system)
  const fmtDate = (d?: string) => {
    if (!d) return "-";
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return d;
  };

  const fmtMoney = (n: any) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <article className="content invoices-compact">
      <style>{`
        .invoices-compact { font-size: 11px; }
        .invoices-compact .legacy-card { padding: 6px; }
        .invoices-compact h5 { font-size: 13px; margin: 4px 0; }
        .invoices-compact hr { margin: 4px 0; }
        .invoices-compact .legacy-dt-toolbar { font-size: 11px; gap: 8px; padding: 4px 0; }
        .invoices-compact .legacy-dt-toolbar input,
        .invoices-compact .legacy-dt-toolbar select { height: 24px; font-size: 11px; padding: 2px 6px; }
        .invoices-compact .legacy-table { font-size: 11px; }
        .invoices-compact .legacy-table th { padding: 5px 6px; font-size: 11px; }
        .invoices-compact .legacy-table td { padding: 3px 6px; }
        .invoices-compact .btn-xs { padding: 2px 6px; font-size: 10px; height: 22px; line-height: 18px; }
        .invoices-compact .legacy-actions { gap: 3px; }
        .invoices-compact .legacy-pagination .page-link { padding: 2px 8px; font-size: 11px; }
        .invoices-compact .legacy-dt-info { font-size: 11px; padding: 4px 0; }
        .invoices-compact .st-paid, .invoices-compact .st-partial, .invoices-compact .st-due,
        .invoices-compact .st-overdue, .invoices-compact .st-canceled, .invoices-compact .st-draft { padding: 1px 6px; font-size: 10px; }
        .invoices-compact .workflow-select { height: 22px; font-size: 10px; padding: 1px 4px; }
        ${mobileDocListCSS}
      `}</style>
      <div className="legacy-card">
        <div className="grid_3 grid_4 table-responsive">
          <h5 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            الفواتير
          </h5>
          <hr />

          {/* Workflow status filter chips */}
          <div className="flex flex-wrap gap-2 mb-3" dir="rtl">
            <button
              type="button"
              onClick={() => { setWorkflowFilter("all"); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${workflowFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
            >
              الكل ({(invoices || []).length})
            </button>
            {WORKFLOW_STATUSES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => { setWorkflowFilter(s.value); setPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition flex items-center gap-1 ${workflowFilter === s.value ? "bg-primary text-primary-foreground border-primary" : `${s.bg} ${s.color}`}`}
              >
                <s.icon className="w-3 h-3" />
                {s.label} ({counts[s.value] || 0})
              </button>
            ))}
          </div>

          {/* Payment status filter chips */}
          <div className="flex flex-wrap gap-2 mb-3" dir="rtl">
            <span className="text-xs text-muted-foreground self-center ml-1">الدفع:</span>
            <button
              type="button"
              onClick={() => { setPaymentFilter("all"); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${paymentFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
            >
              الكل ({(invoices || []).length})
            </button>
            {(["unpaid", "partial", "paid"] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => { setPaymentFilter(k); setPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${paymentFilter === k ? "bg-primary text-primary-foreground border-primary" : PAYMENT_META[k].chipCls}`}
              >
                {PAYMENT_META[k].label} ({paymentCounts[k] || 0})
              </button>
            ))}
          </div>

          {/* Mobile toolbar */}
          <div className="mobile-toolbar">
            <input
              type="search"
              placeholder="بحث في الفواتير أو العميل..."
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
            {/* Financial status filter removed — invoices use workflow_status only */}
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
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
          </div>

          <div className="desktop-table-wrap" style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", border: "1px solid hsl(var(--border))", borderRadius: 4 }}>
          <table className="legacy-table" cellSpacing={0} width="100%">
            <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--card))" }}>
              <tr>
                <th style={{ width: 40 }}>رقم</th>
                <th style={{ width: 80 }}># فاتورة</th>
                <th>العميل</th>
                <th style={{ width: 110 }}>تاريخ</th>
                <th style={{ width: 140 }}>مبلغ</th>
                <th style={{ width: 170 }}>الحالة</th>
                <th style={{ width: 110 }}>المستخدم</th>
                <th style={{ width: 100 }}>الدفع</th>
                <th style={{ width: 240 }}>إعدادات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 30 }}>Processing...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 30 }}>لا توجد فواتير</td></tr>
              ) : paginated.map((inv: any, idx: number) => {
                const rowCls = (start + idx) % 2 === 0 ? "odd" : "even";
                const note = (inv.user_note || inv.internal_note || "").trim();
                const ws = (inv.workflow_status || "new") as WorkflowStatus;
                return (
                  <tr key={inv.id} className={rowCls}>
                    <td>{start + idx + 1}</td>
                    <td>{inv.invoice_number}</td>
                    <td>{inv.customers?.name || "كاش"}</td>
                    <td>{fmtDate(inv.date)}</td>
                    <td>{fmtMoney(inv.total)} {inv.currency_code || currency}</td>
                    <td>
                      <select
                        value={ws}
                        onChange={(e) => handleWorkflowChange(inv, e.target.value as WorkflowStatus)}
                        className="workflow-select rounded border bg-background"
                        title="تغيير الحالة"
                      >
                        {WORKFLOW_STATUSES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <div className="mt-1"><WorkflowStatusBadge status={ws} invoiceId={inv.id} /></div>
                    </td>
                    <td>{inv.created_by || ""}</td>
                    <td>
                      {(() => {
                        const ps = getPaymentStatus(inv);
                        const meta = PAYMENT_META[ps];
                        const paid = Number(inv.paid_amount || 0);
                        const total = Number(inv.total || 0);
                        return (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${meta.cls}`}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums" title="المدفوع / الإجمالي">
                              {fmtMoney(paid)} / {fmtMoney(total)}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <span className="legacy-actions">
                        <button
                          type="button"
                          className="btn-xs btn-warning"
                          title={note ? "تعديل مذكرة" : "اضف ملاحظة"}
                          onClick={() => {
                            const v = prompt("ملاحظة:", note);
                            if (v === null) return;
                            supabase.from("invoices").update({ user_note: v }).eq("id", inv.id)
                              .then(({ error }) => error ? toast.error(error.message) : toast.success("تم الحفظ"));
                          }}
                        >
                          {note ? "✎" : "+"}
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-success"
                          onClick={() => navigate(`/invoices/view/${inv.id}`)}
                          title="عرض"
                        >
                          📄 عرض
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-info"
                          title="طباعة"
                          onClick={() => handlePrint(inv, "full", false)}
                        >
                          🖨 طباعة
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-warning"
                          onClick={() => navigate(`/invoices/edit/${inv.id}`)}
                          title="تعديل"
                        >
                          ✎ تعديل
                        </button>
                        {inv.customers?.phone && (
                          <button
                            type="button"
                            className="btn-xs btn-primary"
                            onClick={() => handleWhatsApp(inv)}
                            title="واتساب"
                          >
                            ✉
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-xs btn-danger"
                          onClick={() => handleDelete(inv.id)}
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
              <div style={{ textAlign: "center", padding: 30, color: "hsl(var(--muted-foreground))" }}>لا توجد فواتير</div>
            ) : paginated.map((inv: any, idx: number) => {
              const ws = (inv.workflow_status || "new") as WorkflowStatus;
              const ps = getPaymentStatus(inv);
              const pmeta = PAYMENT_META[ps];
              return (
                <MobileDocCard
                  key={inv.id}
                  index={start + idx + 1}
                  number={inv.invoice_number}
                  party={inv.customers?.name || "كاش"}
                  date={fmtDate(inv.date)}
                  amount={`${fmtMoney(inv.total)} ${inv.currency_code || currency}`}
                  status={
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      <WorkflowStatusBadge status={ws} invoiceId={inv.id} />
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${pmeta.cls}`}>
                        {pmeta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        مدفوع: {fmtMoney(inv.paid_amount)}
                      </span>
                    </span>
                  }
                  onOpen={() => navigate(`/invoices/view/${inv.id}`)}
                  actions={
                    <>
                      <button className="btn-xs btn-warning" onClick={() => navigate(`/invoices/edit/${inv.id}`)}>✎ تعديل</button>
                      <button className="btn-xs btn-info" onClick={() => handlePrint(inv, "full", false)} title="طباعة">🖨 طباعة</button>
                      {inv.customers?.phone && (
                        <button className="btn-xs btn-primary" onClick={() => handleWhatsApp(inv)}>✉ واتساب</button>
                      )}
                      <button className="btn-xs btn-danger" onClick={() => handleDelete(inv.id)}>🗑 حذف</button>
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

      <ShippingDispatchDialog open={showDispatch} onClose={() => setShowDispatch(false)} />
    </article>
  );
}
