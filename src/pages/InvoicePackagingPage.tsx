import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePackagingTypes } from "@/hooks/useData";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, ChevronDown, ChevronUp, Send, Printer } from "lucide-react";
import PackagingItemsManager from "@/components/packaging/PackagingItemsManager";
import { buildPackagingTextMessage, openWhatsAppPackagingText, openWhatsAppPackagingLink, type PackagingRow } from "@/utils/packagingShare";
import ZoomControls from "@/components/ZoomControls";

export default function InvoicePackagingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backToEdit = (location.state as any)?.from === 'edit';
  const backPath = backToEdit ? `/invoices/create?edit=${id}` : `/invoices/view/${id}`;
  const { data: packagingTypes } = usePackagingTypes();

  const [invoice, setInvoice] = useState<any>(null);
  const [packagingList, setPackagingList] = useState<any[]>([]);
  const [invoiceProductIds, setInvoiceProductIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Form
  const [packagingTypeId, setPackagingTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [piecesPerPack, setPiecesPerPack] = useState("1");
  const [weight, setWeight] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [cost, setCost] = useState("0");
  const [notes, setNotes] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  useEffect(() => { loadData();   }, [id]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: inv, error: invErr } = await supabase.from("invoices").select("*, customers(name)").eq("id", id).single();
      if (invErr) throw invErr;
      setInvoice(inv);

      const { data: items, error: itemsErr } = await supabase.from("invoice_items").select("product_id").eq("invoice_id", id);
      if (itemsErr) throw itemsErr;
      const ids = Array.from(new Set((items || []).map((it: any) => it.product_id).filter(Boolean))) as string[];
      setInvoiceProductIds(ids);

      const { data: pkgs, error: pkgsErr } = await supabase
        .from("invoice_packaging")
        .select("*, packaging_types(name)")
        .eq("invoice_id", id)
        .order("created_at", { ascending: false });
      if (pkgsErr) throw pkgsErr;
      setPackagingList(pkgs || []);
    } catch (e: any) {
      console.error("loadData failed:", e);
      toast.error(e?.message || "تعذّر تحميل بيانات التغليف");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!id) return;
    const packs = parseInt(quantity);
    const pieces = parseInt(piecesPerPack);
    if (!isFinite(packs) || packs <= 0) { toast.error("عدد العبوات يجب أن يكون أكبر من صفر"); return; }
    if (!isFinite(pieces) || pieces <= 0) { toast.error("عدد القطع بالعبوة يجب أن يكون أكبر من صفر"); return; }
    const weightNum = weight === "" ? null : parseFloat(weight);
    if (weightNum !== null && (!isFinite(weightNum) || weightNum < 0)) { toast.error("الوزن غير صحيح"); return; }
    const costNum = parseFloat(cost);
    if (cost !== "" && (!isFinite(costNum) || costNum < 0)) { toast.error("التكلفة غير صحيحة"); return; }
    try {
      const { error } = await supabase.from("invoice_packaging").insert({
        invoice_id: id,
        packaging_type_id: packagingTypeId || null,
        packs_count: packs,
        pieces_per_pack: pieces,
        quantity: packs * pieces,
        weight: weightNum,
        dimensions: dimensions || null,
        cost: isFinite(costNum) ? costNum : 0,
        notes: notes || null,
      });
      if (error) throw error;
      toast.success("تم إضافة التغليف بنجاح");
      setPackagingTypeId(""); setQuantity("1"); setPiecesPerPack("1"); setWeight("");
      setDimensions(""); setCost("0"); setNotes("");
      loadData();
    } catch (e: any) {
      console.error("packaging insert failed:", e);
      toast.error(e?.message || "تعذّر إضافة التغليف");
    }
  };

  const handleDelete = async (pkgId: string) => {
    if (!confirm("حذف هذا التغليف؟")) return;
    try {
      const { error } = await supabase.from("invoice_packaging").delete().eq("id", pkgId);
      if (error) throw error;
      toast.success("تم الحذف");
      loadData();
    } catch (e: any) {
      console.error("packaging delete failed:", e);
      toast.error(e?.message || "تعذّر حذف التغليف");
    }
  };

  const toggleExpanded = (pkgId: string) => {
    const next = new Set(expanded);
    if (next.has(pkgId)) next.delete(pkgId); else next.add(pkgId);
    setExpanded(next);
  };

  // filter + paginate
  const normalize = (s: any) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ")
      .trim();

  const filtered = useMemo(() => {
    const tokens = normalize(search).split(" ").filter(Boolean);
    if (!tokens.length) return packagingList;
    return packagingList.filter((p: any) => {
      const hay = normalize(
        [
          p.packaging_types?.name,
          p.quantity,
          p.weight,
          p.dimensions,
          p.cost,
          p.notes,
        ].join(" ")
      );
      return tokens.every((t) => hay.includes(t));
    });
  }, [packagingList, search]);

  const showAll = perPage === -1;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = showAll ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const fromIdx = filtered.length === 0 ? 0 : showAll ? 1 : (safePage - 1) * perPage + 1;
  const toIdx = showAll ? filtered.length : Math.min(safePage * perPage, filtered.length);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  if (loading) return (
    <article className="content">
      <div className="legacy-card card-block">
        <div style={{ textAlign: "center", padding: "3rem" }}>جارٍ التحميل...</div>
      </div>
    </article>
  );

  return (
    <article className="content neo-quote-scope" dir="rtl">
      <style>{`
        .neo-quote-scope .header-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-end; background: hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:6px; padding:5px 8px; margin-bottom:6px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
        .neo-quote-scope .header-bar .field { display:flex; flex-direction:column; }
        .neo-quote-scope .header-bar label { font-size:10px; color: hsl(var(--muted-foreground)); margin-bottom:1px; display:block; }
        .neo-quote-scope .header-bar .form-control { width:100%; padding:2px 5px; height:24px; font-size:11px; border:1px solid hsl(var(--input)); border-radius:4px; background: hsl(var(--card)); color: hsl(var(--foreground)); }
        .neo-quote-scope .header-bar .form-control[readonly] { background: hsl(var(--muted) / 0.5); cursor: not-allowed; }
        .neo-quote-scope .header-bar .customer-pill { font-size:10px; color: hsl(var(--foreground)); padding:1px 6px; background: hsl(var(--muted)); border-radius:3px; white-space:nowrap; align-self:center; }
        .neo-quote-scope .header-bar .field .form-control.customer-name-input { font-size:14px; font-weight:600; }

        /* Items table — يطابق شاشة بنود الفاتورة */
        .neo-quote-scope .excel-table { width:100%; border-collapse:collapse; }
        .neo-quote-scope .excel-table .item_header { background:#3b82f6 !important; color:#ffffff !important; }
        .neo-quote-scope .excel-table .item_header th { padding:5px 4px; font-weight:600; font-size:11px; text-align:center; background:#3b82f6 !important; color:#ffffff !important; border-color:#3b82f6 !important; }
        .neo-quote-scope .excel-table .excel-row td { padding:2px 6px; border-bottom:1px solid hsl(var(--border)); font-size:11px; }
        .neo-quote-scope .excel-table .excel-row:nth-child(even) td { background: hsl(var(--muted) / 0.5); }
      `}</style>
      <div className="legacy-card card-block">
        <div className="grid_3 grid_4">
          <div className="header-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 className="title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span>إدارة تغليف الفاتورة #{invoice?.invoice_number}</span>
              <button onClick={() => navigate(backPath)} className="legacy-btn legacy-btn-default btn-sm">
                <ArrowRight /> العودة للفاتورة
              </button>
              <ZoomControls />
              <button
                onClick={() => navigate(`/preview/invoice/${id}/packaging`)}
                className="legacy-btn legacy-btn-primary btn-sm"
                title="فتح معاينة التقرير لاختيار الأعمدة وطريقة الإرسال"
              >
                <Printer /> طباعة
              </button>
            </h3>
          </div>

          {/* ============ Header bar (مثل شاشة البنود) ============ */}
          <div className="header-bar" style={{ marginTop: 8 }}>
            <div className="field" style={{ flex: "1 1 240px", minWidth: 220 }}>
              <label>العميل</label>
              <input className="form-control customer-name-input" value={invoice?.customers?.name || "كاش"} readOnly />
            </div>
            {invoice?.customers?.name && (
              <div className="customer-pill mx-0 py-[5px] font-light">رقم الفاتورة: #{invoice?.invoice_number}</div>
            )}
            <div className="field" style={{ width: 140 }}>
              <label>رقم الفاتورة</label>
              <input className="form-control" value={invoice?.invoice_number || ""} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>التاريخ</label>
              <input type="date" className="form-control" value={invoice?.date || ""} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>الاستحقاق</label>
              <input type="date" className="form-control" value={invoice?.due_date || ""} readOnly />
            </div>
            <div className="field" style={{ width: 110 }}>
              <label>طريقة الدفع</label>
              <input className="form-control" value={invoice?.payment_method || "—"} readOnly />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label>العملة</label>
              <input className="form-control" value={invoice?.currency_code || "SDG"} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>الإجمالي</label>
              <input className="form-control" value={Number(invoice?.total || 0).toLocaleString()} readOnly style={{ fontWeight: 600 }} />
            </div>
          </div>

          {/* Add form */}
          <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
            <h5 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus /> إضافة تغليف جديد
            </h5>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.5rem", alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>نوع التغليف</label>
                <select className="legacy-control" value={packagingTypeId} onChange={(e) => setPackagingTypeId(e.target.value)}>
                  <option value="">اختر نوع التغليف</option>
                  {(packagingTypes as any[] || []).map((pt: any) => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>الكمية</label>
                <input type="number" className="legacy-control" value={quantity} min={1} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div style={{ position: "relative" }}>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>× عدد القطع</label>
                <input type="number" className="legacy-control" value={piecesPerPack} min={1} onChange={(e) => setPiecesPerPack(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>الوزن (كجم)</label>
                <input type="number" className="legacy-control" value={weight} step="0.1" onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>الأبعاد</label>
                <input type="text" className="legacy-control" value={dimensions} placeholder="30x20x15 سم" onChange={(e) => setDimensions(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>التكلفة</label>
                <input type="number" className="legacy-control" value={cost} step="0.01" onChange={(e) => setCost(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>ملاحظات</label>
                <input type="text" className="legacy-control" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <button onClick={handleAdd} className="legacy-btn legacy-btn-primary btn-sm" style={{ width: "100%" }}>
                  <Plus /> إضافة التغليف
                </button>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="legacy-dt-toolbar">
            <label>
              أظهر{" "}
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>الكل</option>
              </select>{" "}
              مدخلات
            </label>
            <label>
              ابحث:
              <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </label>
          </div>

          {/* Table */}
          <table className="excel-table">
            <thead>
              <tr className="item_header">
                <th style={{ width: 36 }}></th>
                <th style={{ width: 50 }}>#</th>
                <th>نوع التغليف</th>
                <th style={{ width: 70 }}>الكمية</th>
                <th style={{ width: 90 }}>× عدد القطع</th>
                <th style={{ width: 70 }}>الإجمالي</th>
                <th style={{ width: 90 }}>الوزن</th>
                <th>الأبعاد</th>
                <th style={{ width: 100 }}>التكلفة</th>
                <th>ملاحظات</th>
                <th style={{ width: 80 }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: "2rem", fontSize: 11 }}>لا توجد سجلات تغليف لهذه الفاتورة</td></tr>
              ) : paginated.map((pkg: any, i: number) => {
                const isOpen = expanded.has(pkg.id);
                const packs = Number(pkg.packs_count ?? 1);
                const pieces = Number(pkg.pieces_per_pack ?? pkg.quantity ?? 1);
                const totalQty = packs * pieces;
                return (
                  <React.Fragment key={pkg.id}>
                    <tr className="excel-row">
                      <td className="text-center">
                        <button onClick={() => toggleExpanded(pkg.id)}
                          className="legacy-btn legacy-btn-default btn-sm" title="بنود التغليف"
                          style={{ padding: "2px 6px" }}>
                          {isOpen ? <ChevronUp /> : <ChevronDown />}
                        </button>
                      </td>
                      <td className="text-center">{(showAll ? 0 : (safePage - 1) * perPage) + i + 1}</td>
                      <td>{pkg.packaging_types?.name || "—"}</td>
                      <td className="text-center">{packs}</td>
                      <td className="text-center" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>× {pieces}</td>
                      <td className="text-center" style={{ fontWeight: 600 }}>{totalQty}</td>
                      <td className="text-center">{pkg.weight ? `${pkg.weight} كجم` : "—"}</td>
                      <td>{pkg.dimensions || "—"}</td>
                      <td className="text-center">{Number(pkg.cost || 0).toLocaleString()}</td>
                      <td>{pkg.notes || "—"}</td>
                      <td className="text-center">
                        <button onClick={() => handleDelete(pkg.id)} className="legacy-btn legacy-btn-danger btn-sm" title="حذف">
                          <Trash2 />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={11} style={{ padding: 0, background: "hsl(var(--muted) / 0.2)" }}>
                          <PackagingItemsManager
                            parentTable="invoice_packaging"
                            itemsTable="invoices_packaging_items"
                            parentFkColumn="invoice_packaging_id"
                            parentId={pkg.id}
                            allowedProductIds={invoiceProductIds}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div className="legacy-dt-info">
              إظهار {fromIdx} إلى {toIdx} من أصل {filtered.length} مدخل
            </div>
            {!showAll && totalPages > 1 && (
              <ul className="legacy-pagination">
                <li className={`page-item ${safePage === 1 ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>السابق</button>
                </li>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, Math.min(safePage - 3, totalPages - 5)),
                  Math.max(0, Math.min(safePage - 3, totalPages - 5)) + 5
                ).map((p) => (
                  <li key={p} className={`page-item ${p === safePage ? "active" : ""}`}>
                    <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                  </li>
                ))}
                <li className={`page-item ${safePage === totalPages ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>التالي</button>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
