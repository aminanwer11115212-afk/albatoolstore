import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePackagingTypes } from "@/hooks/useData";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, Save, Send, Printer } from "lucide-react";
import { buildPackagingTextMessage, openWhatsAppPackagingText, openWhatsAppPackagingLink, type PackagingRow } from "@/utils/packagingShare";
import ZoomControls from "@/components/ZoomControls";

export default function QuotePackagingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backToEdit = (location.state as any)?.from === 'edit';
  const backPath = backToEdit ? `/quotes/create?edit=${id}` : `/quotes/view/${id}`;
  const { data: packagingTypes } = usePackagingTypes();

  const [quote, setQuote] = useState<any>(null);
  const [headerId, setHeaderId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [quoteProducts, setQuoteProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // add row form
  const [quantity, setQuantity] = useState("1");
  const [piecesPerPack, setPiecesPerPack] = useState("1");
  const [packagingTypeId, setPackagingTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");

  const qtyRef = useRef<HTMLInputElement>(null);
  const piecesRef = useRef<HTMLInputElement>(null);
  const typeSelectRef = useRef<HTMLSelectElement>(null);
  const productSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { loadData();   }, [id]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    const { data: q } = await supabase
      .from("quotes")
      .select("*, customers(name)")
      .eq("id", id)
      .single();
    setQuote(q);

    let { data: header } = await supabase
      .from("quotes_packaging")
      .select("id")
      .eq("quote_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!header) {
      const { data: created, error } = await supabase
        .from("quotes_packaging")
        .insert({ quote_id: id, quantity: 1 })
        .select("id")
        .single();
      if (error) { toast.error(error.message); setLoading(false); return; }
      header = created;
    }
    setHeaderId(header!.id);

    const { data: rows } = await supabase
      .from("quotes_packaging_items")
      .select("*, packaging_types(name), products(name)")
      .eq("quote_packaging_id", header!.id)
      .order("created_at", { ascending: true });
    setItems(rows || []);

    const { data: qItems } = await supabase
      .from("quote_items")
      .select("product_id, product_name")
      .eq("quote_id", id);
    const seen = new Set<string>();
    const list = (qItems || [])
      .filter((q: any) => {
        const key = q.product_id || q.product_name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((q: any) => ({ id: q.product_id, name: q.product_name }));
    setQuoteProducts(list);

    setSelected(new Set());
    setLoading(false);
  };

  const handleAdd = async (overrideProductValue?: string) => {
    if (!headerId) return;
    const packs = parseInt(quantity) || 1;
    const pieces = parseInt(piecesPerPack) || 1;
    const totalQty = packs * pieces;

    let pid = productId;
    let pname = productName;
    if (overrideProductValue !== undefined) {
      const p = quoteProducts.find((x: any) => (x.id || x.name) === overrideProductValue);
      if (p) {
        pid = p.id || "";
        pname = p.name || "";
      }
    }

    if (!packagingTypeId && !pname && !pid) {
      toast.error("اختر نوع تغليف أو منتج");
      return;
    }
    const finalName =
      pname ||
      quoteProducts.find((p: any) => p.id === pid)?.name ||
      null;

    const { error } = await supabase.from("quotes_packaging_items").insert({
      quote_packaging_id: headerId,
      packaging_type_id: packagingTypeId || null,
      product_id: pid || null,
      product_name: finalName,
      packs_count: packs,
      pieces_per_pack: pieces,
      quantity: totalQty,
      price: 0,
      total: 0,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تمت الإضافة");
    setQuantity("1"); setPiecesPerPack("1"); setPackagingTypeId(""); setProductId(""); setProductName("");
    await loadData();
    setTimeout(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }, 50);
  };

  const handleDelete = async (rowId: string) => {
    if (!confirm("حذف هذا البند؟")) return;
    await supabase.from("quotes_packaging_items").delete().eq("id", rowId);
    toast.success("تم الحذف");
    loadData();
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} بند؟`)) return;
    await supabase.from("quotes_packaging_items").delete().in("id", Array.from(selected));
    toast.success("تم حذف المحدد");
    loadData();
  };

  const handleSave = async () => { toast.success("تم حفظ التغليف"); };

  const toggleSelect = (rowId: string) => {
    const next = new Set(selected);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    setSelected(next);
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
    if (!tokens.length) return items;
    return items.filter((it: any) => {
      const hay = normalize(
        [
          it.packaging_types?.name,
          it.quantity,
          it.product_name,
          it.products?.name,
        ].join(" ")
      );
      return tokens.every((t) => hay.includes(t));
    });
  }, [items, search]);

  const showAll = perPage === -1;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = showAll ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const fromIdx = filtered.length === 0 ? 0 : showAll ? 1 : (safePage - 1) * perPage + 1;
  const toIdx = showAll ? filtered.length : Math.min(safePage * perPage, filtered.length);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const totalQty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);

  if (loading) {
    return (
      <article className="content">
        <div className="legacy-card card-block">
          <div style={{ textAlign: "center", padding: "3rem" }}>جارٍ التحميل...</div>
        </div>
      </article>
    );
  }

  return (
    <article className="content neo-quote-scope" dir="rtl">
      <style>{`
        .neo-quote-scope .header-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-end; background: hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:6px; padding:5px 8px; margin-bottom:6px; box-shadow:0 1px 2px rgba(0,0,0,.04); }
        .neo-quote-scope .header-bar .field { display:flex; flex-direction:column; }
        .neo-quote-scope .header-bar label { font-size:10px; color: hsl(var(--muted-foreground)); margin-bottom:1px; display:block; }
        .neo-quote-scope .header-bar .form-control { width:100%; padding:2px 5px; height:24px; font-size:11px; border:1px solid hsl(var(--input)); border-radius:4px; background: hsl(var(--card)); color: hsl(var(--foreground)); }
        .neo-quote-scope .header-bar .form-control[readonly] { background: hsl(var(--muted) / 0.5); cursor: not-allowed; }
        .neo-quote-scope .header-bar .field .form-control.customer-name-input { font-size:14px; font-weight:600; }

        /* Items table — يطابق شاشة بنود عرض السعر */
        .neo-quote-scope .excel-table { width:100%; border-collapse:collapse; }
        .neo-quote-scope .excel-table .item_header { background:#3b82f6 !important; color:#ffffff !important; }
        .neo-quote-scope .excel-table .item_header th { padding:5px 4px; font-weight:600; font-size:11px; text-align:center; background:#3b82f6 !important; color:#ffffff !important; border-color:#3b82f6 !important; }
        .neo-quote-scope .excel-table .excel-row td { padding:2px 6px; border-bottom:1px solid hsl(var(--border)); font-size:11px; }
        .neo-quote-scope .excel-table .excel-row:nth-child(even) td { background: hsl(var(--muted) / 0.5); }
        .neo-quote-scope .excel-table tfoot td { background: hsl(var(--muted) / 0.7); font-weight:600; font-size:11px; padding:4px 6px; }
      `}</style>
      <div className="legacy-card card-block">
        <div className="grid_3 grid_4">
          <div className="header-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 className="title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span>إدارة تغليف عرض السعر #{quote?.quote_number}</span>
              <button onClick={handleSave} className="legacy-btn legacy-btn-success btn-sm">
                <Save /> حفظ التغليف
              </button>
              <button onClick={() => navigate(backPath)} className="legacy-btn legacy-btn-default btn-sm">
                <ArrowRight /> {backToEdit ? "العودة لعرض السعر" : "العودة للعرض"}
              </button>
              <ZoomControls />
              <button
                onClick={() => navigate(`/preview/quote/${id}/packaging`)}
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
              <input className="form-control customer-name-input" value={quote?.customers?.name || "—"} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>رقم العرض</label>
              <input className="form-control" value={quote?.quote_number || ""} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>تاريخ العرض</label>
              <input type="date" className="form-control" value={quote?.date || ""} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>الصلاحية</label>
              <input type="date" className="form-control" value={quote?.valid_until || ""} readOnly />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label>العملة</label>
              <input className="form-control" value={quote?.currency_code || "SDG"} readOnly />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label>الإجمالي</label>
              <input className="form-control" value={Number(quote?.total || 0).toLocaleString()} readOnly style={{ fontWeight: 600 }} />
            </div>
          </div>

          {/* Add form */}
          <div className="legacy-form-horizontal" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 24px 90px 1.4fr auto", gap: "0.5rem", alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>الكمية</label>
                <input
                  ref={qtyRef}
                  type="number"
                  className="legacy-control"
                  value={quantity}
                  min={1}
                  onChange={(e) => setQuantity(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); typeSelectRef.current?.focus(); } }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>نوع التغليف</label>
                <select
                  ref={typeSelectRef}
                  className="legacy-control"
                  value={packagingTypeId}
                  onChange={(e) => { setPackagingTypeId(e.target.value); setTimeout(() => piecesRef.current?.focus(), 50); }}
                >
                  <option value="">اختر...</option>
                  {(packagingTypes as any[] || []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 8, fontWeight: 700, fontSize: 18, color: "hsl(var(--primary))" }}>×</div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>عدد القطع</label>
                <input
                  ref={piecesRef}
                  type="number"
                  className="legacy-control"
                  value={piecesPerPack}
                  min={1}
                  onChange={(e) => setPiecesPerPack(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); productSelectRef.current?.focus(); } }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 2 }}>اسم المنتج</label>
                <select
                  ref={productSelectRef}
                  className="legacy-control"
                  value={productId || productName}
                  onChange={(e) => {
                    const v = e.target.value;
                    const p = quoteProducts.find((x: any) => (x.id || x.name) === v);
                    if (p) { setProductId(p.id || ""); setProductName(p.name || ""); }
                    setTimeout(() => handleAdd(v), 30);
                  }}
                >
                  <option value="">اختر من منتجات العرض</option>
                  {quoteProducts.map((p: any) => (
                    <option key={p.id || p.name} value={p.id || p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={() => handleAdd()} className="legacy-btn legacy-btn-primary btn-sm">
                <Plus /> إضافة
              </button>
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

          {/* Items table */}
          <table className="excel-table">
            <thead>
              <tr className="item_header">
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selected.size === items.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(items.map(i => i.id)) : new Set())}
                  />
                </th>
                <th style={{ width: 50 }}>#</th>
                <th style={{ width: 70 }}>الكمية</th>
                <th>نوع التغليف</th>
                <th style={{ width: 90 }}>× عدد القطع</th>
                <th>اسم المنتج</th>
                <th style={{ width: 70 }}>الإجمالي</th>
                <th style={{ width: 90 }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", fontSize: 11 }}>لا توجد بنود تغليف</td></tr>
              ) : paginated.map((it, i) => {
                const packs = Number(it.packs_count ?? 1);
                const pieces = Number(it.pieces_per_pack ?? it.quantity ?? 1);
                const totalQty = packs * pieces;
                return (
                  <tr key={it.id} className="excel-row">
                    <td className="text-center">
                      <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSelect(it.id)} />
                    </td>
                    <td className="text-center">{(showAll ? 0 : (safePage - 1) * perPage) + i + 1}</td>
                    <td className="text-center">{packs}</td>
                    <td>{it.packaging_types?.name || "—"}</td>
                    <td className="text-center" style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>× {pieces}</td>
                    <td>{it.product_name || it.products?.name || "—"}</td>
                    <td className="text-center" style={{ fontWeight: 600 }}>{totalQty}</td>
                    <td className="text-center">
                      <button onClick={() => handleDelete(it.id)} className="legacy-btn legacy-btn-danger btn-sm" title="حذف">
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-center">إجمالي القطع: {totalQty}</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div className="legacy-dt-info">
              إظهار {fromIdx} إلى {toIdx} من أصل {filtered.length} مدخل
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button onClick={handleDeleteSelected} disabled={selected.size === 0}
                className="legacy-btn legacy-btn-danger btn-sm" style={{ opacity: selected.size === 0 ? 0.5 : 1 }}>
                <Trash2 /> حذف المحدد ({selected.size})
              </button>
              {!showAll && totalPages > 1 && (
                <ul className="legacy-pagination" style={{ margin: 0 }}>
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
      </div>
    </article>
  );
}
