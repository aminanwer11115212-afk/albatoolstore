import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSuppliers, useCompanySettings, usePurchaseOrders } from "@/hooks/useData";
import { toast } from "sonner";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import PrintMenu, { type PrintVariant } from "@/components/PrintMenu";
import { MobileDocCard, mobileDocListCSS } from "@/components/mobile/MobileDocList";
import { StatusChip } from "@/components/ui/status-chip";
import { receiveStockForPurchaseOnce, restoreStockForPurchaseOnce } from "@/utils/stockReceive";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import { useConfirmDelete } from "@/components/common/ConfirmDeleteProvider";
import SupplierPaymentDialog from "@/components/purchase/SupplierPaymentDialog";

const statusMap: Record<string, { label: string; cls: string }> = {
  pending:   { label: "معلق",  cls: "st-pending" },
  received:  { label: "مستلَم", cls: "st-paid" },
  cancelled: { label: "ملغي",  cls: "st-canceled" },
};

function usePurchaseOrdersFullList() {
  return useQuery({
    queryKey: ["purchase-orders-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export default function PurchasePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [payFor, setPayFor] = useState<any | null>(null);

  const { data: orders, isLoading } = usePurchaseOrdersFullList();
  const { remove } = usePurchaseOrders();
  const { data: suppliers } = useSuppliers();
  const { data: companyArr } = useCompanySettings();
  const company = companyArr?.[0] || null;
  const currency = company?.currency || "SDG";

  const supplierMap = new Map<string, any>();
  (suppliers || []).forEach((s: any) => supplierMap.set(s.id, s));

  const confirmDelete = useConfirmDelete();
  const handleDelete = async (id: string) => {
    const order = (orders || []).find((o: any) => o.id === id);
    const willRestore = order?.status === "received";

    // Look up which products in this PO are "safe to also delete":
    // products that (a) exist, (b) are only referenced by THIS purchase order,
    // (c) are not used in any invoice, quote, stock return, or stock transfer,
    // and (d) have no current stock (or stock will be zeroed by the restore).
    let deletableProductIds: string[] = [];
    try {
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("product_id, quantity")
        .eq("purchase_order_id", id);
      const productIds = Array.from(
        new Set(((poItems || []) as any[]).map((r) => r.product_id).filter(Boolean)),
      ) as string[];

      if (productIds.length) {
        // For each candidate, run cheap "any row exists" probes on the sibling tables.
        const [invRes, quoRes, retRes, otherPoRes, tfrRes, prodRes] = await Promise.all([
          supabase.from("invoice_items").select("product_id").in("product_id", productIds).limit(500),
          supabase.from("quote_items").select("product_id").in("product_id", productIds).limit(500),
          supabase.from("stock_return_items").select("product_id").in("product_id", productIds).limit(500),
          supabase.from("purchase_order_items").select("product_id, purchase_order_id").in("product_id", productIds).neq("purchase_order_id", id).limit(500),
          supabase.from("stock_transfers").select("product_id").in("product_id", productIds).limit(500),
          supabase.from("products").select("id, stock_quantity").in("id", productIds),
        ]);
        const usedElsewhere = new Set<string>();
        [invRes.data, quoRes.data, retRes.data, otherPoRes.data, tfrRes.data].forEach((rows) => {
          ((rows || []) as any[]).forEach((r) => { if (r?.product_id) usedElsewhere.add(r.product_id); });
        });
        const stockMap = new Map<string, number>();
        ((prodRes.data || []) as any[]).forEach((r) => stockMap.set(r.id, Number(r.stock_quantity || 0)));
        // Compute expected stock AFTER restoring (subtracting) the PO quantities.
        const poQtyByProduct = new Map<string, number>();
        ((poItems || []) as any[]).forEach((r) => {
          if (!r.product_id) return;
          poQtyByProduct.set(r.product_id, (poQtyByProduct.get(r.product_id) || 0) + Number(r.quantity || 0));
        });
        deletableProductIds = productIds.filter((pid) => {
          if (usedElsewhere.has(pid)) return false;
          const currentStock = stockMap.get(pid) ?? 0;
          const afterRestore = willRestore ? currentStock - (poQtyByProduct.get(pid) || 0) : currentStock;
          // Only offer to delete when the product would end up with 0 (or negative) stock.
          return afterRestore <= 0.0001;
        });
      }
    } catch { /* probe is best-effort; fall back to no checkbox */ }

    confirmDelete({
      title: "حذف أمر الشراء",
      description: willRestore
        ? "هذا الأمر مستلَم — سيتم خصم الكميات المستلمة من المخزون عند الحذف."
        : "هل أنت متأكد من حذف هذا الأمر؟",
      confirmLabel: "حذف الأمر",
      successMessage: "تم الحذف" + (willRestore ? " وإرجاع المخزون" : ""),
      errorMessage: "تعذّر حذف الأمر",
      extraCheckbox: deletableProductIds.length
        ? {
            label: `احذف أيضاً ${deletableProductIds.length} منتج أُضيف عبر هذا الأمر ولا يُستخدم في مكان آخر`,
            hint: "المنتجات المستخدَمة في فواتير أو عروض أسعار أو أوامر شراء أخرى لن تُحذف.",
            defaultChecked: false,
          }
        : undefined,
      onConfirm: async ({ extraChecked }) => {
        // 1) استرداد المخزون بحارس idempotency — يقلب الحالة إلى "cancelled" أولاً
        //    ثم يخصم؛ الفشل هنا يُوقف الحذف قبل حدوث أي تلف.
        if (willRestore) {
          const { data: items } = await supabase
            .from("purchase_order_items")
            .select("product_id, quantity")
            .eq("purchase_order_id", id);
          const lines = ((items || []) as any[])
            .filter((it) => it.product_id)
            .map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity || 0) }));
          const res = await restoreStockForPurchaseOnce(id, lines);
          if (!res.restored && res.reason !== "not_received" && res.reason !== "already_cancelled") {
            throw new Error("تعذّر إرجاع المخزون — لم يُحذف الأمر");
          }
        }
        await supabase.from("purchase_order_items").delete().eq("purchase_order_id", id);
        await remove.mutateAsync(id);

        if (extraChecked && deletableProductIds.length) {
          // Re-verify each product is still unused (in case another user just
          // referenced it) before deleting, so we never orphan a live row.
          try {
            const [invRes2, quoRes2, retRes2, otherPoRes2, tfrRes2] = await Promise.all([
              supabase.from("invoice_items").select("product_id").in("product_id", deletableProductIds).limit(500),
              supabase.from("quote_items").select("product_id").in("product_id", deletableProductIds).limit(500),
              supabase.from("stock_return_items").select("product_id").in("product_id", deletableProductIds).limit(500),
              supabase.from("purchase_order_items").select("product_id").in("product_id", deletableProductIds).limit(500),
              supabase.from("stock_transfers").select("product_id").in("product_id", deletableProductIds).limit(500),
            ]);
            const stillUsed = new Set<string>();
            [invRes2.data, quoRes2.data, retRes2.data, otherPoRes2.data, tfrRes2.data].forEach((rows) => {
              ((rows || []) as any[]).forEach((r) => { if (r?.product_id) stillUsed.add(r.product_id); });
            });
            const safeToDelete = deletableProductIds.filter((pid) => !stillUsed.has(pid));
            if (safeToDelete.length) {
              const { error: delProdErr } = await supabase.from("products").delete().in("id", safeToDelete);
              if (delProdErr) throw delProdErr;
              const skipped = deletableProductIds.length - safeToDelete.length;
              if (skipped > 0) toast.info(`تم حذف ${safeToDelete.length} منتج — ${skipped} منتج ما زال مستخدَماً ولم يُحذَف.`);
            } else {
              toast.info("تعذّر حذف المنتجات: أصبحت مستخدَمة في مستندات أخرى.");
            }
          } catch (e: any) {
            toast.error("تم حذف الأمر ولكن تعذّر حذف المنتجات: " + (e?.message || ""));
          }
        }

        window.dispatchEvent(new Event("products:changed"));
      },
    });
  };



  const handleConvertToInvoice = async (o: any) => {
    if (!confirm(`تحويل أمر الشراء ${o.order_number} إلى فاتورة مشتريات (استلام البضاعة وتحديث المخزون)؟`)) return;
    try {
      const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", o.id);
      const lines = (items || []).map((it: any) => ({
        product_id: it.product_id,
        quantity: Number(it.quantity || 0),
      }));

      // استخدام حارس idempotency: يتحقق من الحالة الحالية في DB قبل الإضافة
      const result = await receiveStockForPurchaseOnce(o.id, lines);
      if (!result.added) {
        toast.info("تم استلام هذا الأمر مسبقاً");
        queryClient.invalidateQueries({ queryKey: ["purchase-orders-full"] });
        return;
      }

      // تحديث سعر الشراء لكل منتج
      if (items && items.length > 0) {
        for (const it of items as any[]) {
          if (!it.product_id) continue;
          await supabase.from("products").update({
            purchase_price: Number(it.unit_price || 0),
          }).eq("id", it.product_id);
        }
      }

      await supabase.from("purchase_orders").update({ status: "received" }).eq("id", o.id);
      toast.success(`تم استلام البضاعة وتحديث المخزون`);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders-full"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      // products:changed يُرسَل تلقائياً من receiveStockForPurchaseOnce → stockReceive.applyDeltas
    } catch (e: any) { toast.error(e.message); }
  };

  const handlePrint = async (o: any, variant: PrintVariant = "full", noHeader: boolean = false) => {
    const { data: items } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", o.id);
    const supplier = supplierMap.get(o.supplier_id);
    openPrintWindow(generatePrintHTML({
      type: "purchase",
      number: o.order_number,
      date: o.date,
      customer: supplier ? { name: supplier.name, phone: supplier.phone, address: supplier.address } : null,
      items: (items || []).map((it: any) => ({
        product_name: it.product_name, quantity: it.quantity, unit_price: it.unit_price,
        discount: it.discount || 0, total: it.total, tax_amount: it.tax_amount || 0,
      })),
      subtotal: Number(o.subtotal || 0),
      taxTotal: Number(o.tax_amount || 0),
      discountTotal: Number(o.discount || 0),
      grandTotal: Number(o.total || 0),
      notes: o.notes,
      company: company as any,
      variant, noHeader,
    }));
  };

  const filtered = (orders || []).filter((o: any) => {
    if (statusFilter !== "all" && (o.status || "pending") !== statusFilter) return false;
    if (supplierSearch.trim()) {
      const sName = supplierMap.get(o.supplier_id)?.name || "";
      if (!startsWithMatch(sName, supplierSearch)) return false;
    }
    if (dateFrom && (o.date || "") < dateFrom) return false;
    if (dateTo && (o.date || "") > dateTo) return false;
    if (minAmount.trim()) {
      const min = Number(minAmount) || 0;
      if (Number(o.total || 0) < min) return false;
    }
    if (!search) return true;
    return startsWithAny([o.order_number, supplierMap.get(o.supplier_id)?.name], search);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

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
    <article className="content purchases-compact">
      <style>{`
        .purchases-compact { font-size: 11px; }
        .purchases-compact .legacy-card { padding: 6px; }
        .purchases-compact h5 { font-size: 13px; margin: 4px 0; }
        .purchases-compact hr { margin: 4px 0; }
        .purchases-compact .legacy-dt-toolbar { font-size: 11px; gap: 8px; padding: 4px 0; }
        .purchases-compact .legacy-dt-toolbar input,
        .purchases-compact .legacy-dt-toolbar select { height: 24px; font-size: 11px; padding: 2px 6px; }
        .purchases-compact .legacy-table { font-size: 11px; }
        .purchases-compact .legacy-table th { padding: 5px 6px; font-size: 11px; }
        .purchases-compact .legacy-table td { padding: 3px 6px; }
        .purchases-compact .btn-xs { padding: 2px 6px; font-size: 10px; height: 22px; line-height: 18px; }
        .purchases-compact .legacy-actions { gap: 3px; }
        .purchases-compact .legacy-pagination .page-link { padding: 2px 8px; font-size: 11px; }
        .purchases-compact .legacy-dt-info { font-size: 11px; padding: 4px 0; }
        .purchases-compact .st-pending, .purchases-compact .st-paid, .purchases-compact .st-canceled { padding: 1px 6px; font-size: 10px; }
        ${mobileDocListCSS}
      `}</style>
      <div className="legacy-card" style={{ position: "relative" }}>
        <div className="grid_3 grid_4 table-responsive">
          <h5>أوامر الشراء</h5>
          <hr />

          {/* Mobile toolbar */}
          <div className="mobile-toolbar">
            <input
              type="search"
              placeholder="بحث في أوامر الشراء أو المورد..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
              <option value={10}>10 لكل صفحة</option>
              <option value={25}>25 لكل صفحة</option>
              <option value={50}>50 لكل صفحة</option>
            </select>
            <button
              type="button"
              className="legacy-btn legacy-btn-success"
              onClick={() => navigate("/purchase/create")}
            >
              + أمر شراء جديد
            </button>
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
            <button
              type="button"
              className="legacy-btn legacy-btn-success"
              onClick={() => navigate("/purchase/create")}
            >
              + أمر شراء جديد
            </button>
            <label>
              المورد:
              <input
                type="search"
                placeholder="ابحث باسم المورد..."
                value={supplierSearch}
                onChange={e => { setSupplierSearch(e.target.value); setPage(1); }}
              />
            </label>
            <label>
              الحالة:
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="all">الكل</option>
                <option value="pending">معلق</option>
                <option value="received">مستلَم</option>
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
                <th style={{ width: 100 }}># الأمر</th>
                <th>المورد</th>
                <th style={{ width: 110 }}>التاريخ</th>
                <th style={{ width: 110 }}>استلام متوقع</th>
                <th style={{ width: 140 }}>المبلغ</th>
                <th style={{ width: 80 }}>الحالة</th>
                <th style={{ width: 110 }}>المستخدم</th>
                <th style={{ width: 260 }}>إعدادات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 30 }}>Processing...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 30 }}>لا توجد أوامر شراء</td></tr>
              ) : paginated.map((o: any, idx: number) => {
                const st = statusMap[o.status || "pending"] || statusMap.pending;
                const rowCls = (start + idx) % 2 === 0 ? "odd" : "even";
                const note = (o.user_note || o.internal_note || "").trim();
                const supplier = supplierMap.get(o.supplier_id);
                return (
                  <tr key={o.id} className={rowCls}>
                    <td>{start + idx + 1}</td>
                    <td>{o.order_number}</td>
                    <td>{supplier?.name || "-"}</td>
                    <td>{fmtDate(o.date)}</td>
                    <td>{fmtDate(o.expected_delivery_date)}</td>
                    <td>{fmtMoney(o.total)} {o.currency_code || currency}</td>
                    <td><StatusChip kind="purchase" value={o.status || "pending"} /></td>
                    <td>{o.created_by || ""}</td>
                    <td>
                      <span className="legacy-actions">
                        <button
                          type="button"
                          className="btn-xs btn-warning"
                          title={note ? "تعديل مذكرة" : "اضف ملاحظة"}
                          onClick={() => {
                            const v = prompt("ملاحظة:", note);
                            if (v === null) return;
                            supabase.from("purchase_orders").update({ user_note: v } as any).eq("id", o.id)
                              .then(({ error }) => {
                                if (error) toast.error(error.message);
                                else { toast.success("تم الحفظ"); queryClient.invalidateQueries({ queryKey: ["purchase-orders-full"] }); }
                              });
                          }}
                        >
                          {note ? "✎" : "+"}
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-success"
                          onClick={() => navigate(`/purchase/edit/${o.id}`)}
                          title="تعديل"
                        >
                          📄 تعديل
                        </button>
                        <button
                          type="button"
                          className="btn-xs btn-info"
                          title="طباعة"
                          onClick={() => navigate(`/preview/purchase/${o.id}`)}
                        >
                          🖨 طباعة
                        </button>
                        {o.status !== "received" && (
                          <button
                            type="button"
                            className="btn-xs btn-primary"
                            onClick={() => handleConvertToInvoice(o)}
                            title="استلام البضاعة وتحديث المخزون"
                          >
                            → استلام
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-xs btn-danger"
                          onClick={() => handleDelete(o.id)}
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
              <div style={{ textAlign: "center", padding: 30, color: "hsl(var(--muted-foreground))" }}>لا توجد أوامر شراء</div>
            ) : paginated.map((o: any, idx: number) => {
              const supplier = supplierMap.get(o.supplier_id);
              return (
                <MobileDocCard
                  key={o.id}
                  index={start + idx + 1}
                  number={o.order_number}
                  party={supplier?.name || "-"}
                  date={fmtDate(o.date)}
                  amount={`${fmtMoney(o.total)} ${o.currency_code || currency}`}
                  status={<StatusChip kind="purchase" value={o.status || "pending"} />}
                  onOpen={() => navigate(`/purchase/edit/${o.id}`)}
                  actions={
                    <>
                      {o.status !== "received" && (
                        <button className="btn-xs btn-primary" onClick={() => handleConvertToInvoice(o)} aria-label="استلام">→ استلام</button>
                      )}
                      <button className="btn-xs btn-info" onClick={() => navigate(`/preview/purchase/${o.id}`)} aria-label="طباعة">🖨 طباعة</button>
                      <button className="btn-xs btn-success" onClick={() => navigate(`/purchase/edit/${o.id}`)} aria-label="تعديل">📄 تعديل</button>
                      <button className="btn-xs btn-danger" onClick={() => handleDelete(o.id)} aria-label="حذف">🗑 حذف</button>
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
    </article>
  );
}
