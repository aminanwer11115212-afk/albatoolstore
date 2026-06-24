import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateWorkflowAutoCache } from "@/components/invoice/WorkflowStatusBadge";
import { usePackagingTypes } from "@/hooks/useData";
import { useDialogSize } from "@/hooks/useDialogSize";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Save, ChevronDown, X, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentType: "invoice" | "quote";
  parentId: string;
}

// Searchable combobox: type-to-filter + arrow keys + Enter to pick
const normalizeText = (s: any) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

interface SSOption { value: string; label: string; hint?: string }
interface SSProps {
  inputRef?: React.RefObject<HTMLInputElement>;
  value: string;
  options: SSOption[];
  placeholder?: string;
  onSelect: (opt: SSOption) => void;
  onTab?: () => void;
  onCreate?: (name: string) => void | Promise<void>;
  allowEmpty?: boolean;
}
function SearchableSelect({ inputRef, value, options, placeholder, onSelect, onTab, onCreate, allowEmpty }: SSProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const optionsWithEmpty = useMemo(() => {
    return allowEmpty ? [{ value: "__empty__", label: "— فارغ —" } as SSOption, ...options] : options;
  }, [options, allowEmpty]);

  const selected = optionsWithEmpty.find((o) => o.value === value);
  const displayValue = open ? query : (selected?.label ?? "");

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return optionsWithEmpty;
    return optionsWithEmpty.filter((o) => normalizeText(o.label + " " + (o.hint ?? "")).includes(q));
  }, [query, optionsWithEmpty]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => { setHighlight(0); }, [query, open]);

  const pick = (opt: SSOption) => {
    if (opt.value === "__empty__") {
      onSelect({ value: "", label: "" });
    } else {
      onSelect(opt);
    }
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1 }}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          className="legacy-control"
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault(); setOpen(true);
              setHighlight((h) => Math.min(filtered.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const q = query.trim();
              if (open && q && filtered.length === 0 && onCreate) {
                onCreate(q);
                setQuery(""); setOpen(false);
              } else if (open && filtered[highlight]) pick(filtered[highlight]);
              else { setOpen(false); onTab?.(); }
            } else if (e.key === "Tab") {
              if (open && filtered[highlight]) { pick(filtered[highlight]); }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          style={{ paddingInlineEnd: 28 }}
        />
        {selected && !open && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect({ value: "", label: "" }); }}
            style={{ position: "absolute", insetInlineEnd: 22, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", padding: 2, color: "hsl(var(--muted-foreground))" }}
            title="مسح"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={14} style={{ position: "absolute", insetInlineEnd: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "hsl(var(--muted-foreground))" }} />
      </div>
      {open && filtered.length > 0 && (
        <ul
          style={{
            position: "absolute", zIndex: 50, top: "calc(100% + 2px)", insetInlineStart: 0, minWidth: "100%", width: "max-content", maxWidth: 360,
            background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))",
            border: "1px solid hsl(var(--border))", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            maxHeight: 220, overflowY: "auto", margin: 0, padding: 2, listStyle: "none",
          }}
        >
          {filtered.map((o, i) => (
            <li
              key={o.value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "5px 8px", cursor: "pointer", borderRadius: 4, fontSize: 13, fontWeight: 700,
                background: i === highlight ? "hsl(var(--accent))" : "transparent",
                color: i === highlight ? "hsl(var(--accent-foreground))" : undefined,
                display: "flex", justifyContent: "space-between", gap: 8,
              }}
            >
              <span>{o.label}</span>
              {o.hint && <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div style={{
          position: "absolute", zIndex: 50, top: "calc(100% + 2px)", insetInlineStart: 0, insetInlineEnd: 0,
          background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6,
          padding: "8px", fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center",
        }}>
          {onCreate && query.trim()
            ? <>اضغط Enter لإضافة: <strong>{query.trim()}</strong></>
            : "لا نتائج"}
        </div>
      )}
    </div>
  );
}

export default function PackagingDialog({ open, onOpenChange, parentType, parentId }: Props) {
  const isInvoice = parentType === "invoice";
  const parentTable = isInvoice ? "invoice_packaging" : "quotes_packaging";
  const itemsTable = isInvoice ? "invoices_packaging_items" : "quotes_packaging_items";
  const parentFkColumn = isInvoice ? "invoice_packaging_id" : "quote_packaging_id";
  const idColumn = isInvoice ? "invoice_id" : "quote_id";
  const itemsParentTable = isInvoice ? "invoice_items" : "quote_items";
  const parentNumberField = isInvoice ? "invoice_number" : "quote_number";

  const { data: packagingTypes } = usePackagingTypes();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [parent, setParent] = useState<any>(null);
  const [headerId, setHeaderId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [parentProducts, setParentProducts] = useState<any[]>([]);
  // كميات المنتج في المستند الأم (إجمالي الفاتورة/العرض)
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  // ما تم تغليفه فعلياً لكل منتج
  const [packagedTotals, setPackagedTotals] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(-1);

  // add row form
  const [quantity, setQuantity] = useState("");
  const [piecesPerPack, setPiecesPerPack] = useState("");
  const [packagingTypeId, setPackagingTypeId] = useState("");
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");

  const qtyRef = useRef<HTMLInputElement>(null);
  const piecesRef = useRef<HTMLInputElement>(null);
  const typeSearchRef = useRef<HTMLInputElement>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  // إدارة أنواع التغليف (modal)
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const newTypeNameRef = useRef<HTMLInputElement>(null);

  const resetTypeForm = () => {
    setNewTypeName(""); setNewTypeDesc(""); setEditingTypeId(null);
  };

  const handleSaveType = async () => {
    const name = newTypeName.trim();
    if (!name) { toast.error("أدخل اسم نوع التغليف"); return; }
    if (editingTypeId) {
      const { error } = await (supabase as any)
        .from("packaging_types")
        .update({ name, description: newTypeDesc.trim() || null })
        .eq("id", editingTypeId);
      if (error) { toast.error(error.message); return; }
      toast.success("تم تحديث نوع التغليف");
      await queryClient.invalidateQueries({ queryKey: ["packaging_types"] });
      resetTypeForm();
      setTimeout(() => newTypeNameRef.current?.focus(), 50);
    } else {
      const { data, error } = await (supabase as any)
        .from("packaging_types")
        .insert({ name, description: newTypeDesc.trim() || null })
        .select("id")
        .single();
      if (error) { toast.error(error.message); return; }
      toast.success("تم إضافة نوع التغليف");
      await queryClient.invalidateQueries({ queryKey: ["packaging_types"] });
      resetTypeForm();
      if (data?.id) setPackagingTypeId(data.id);
      setTimeout(() => newTypeNameRef.current?.focus(), 50);
    }
  };

  const handleEditType = (t: any) => {
    setEditingTypeId(t.id);
    setNewTypeName(t.name || "");
    setNewTypeDesc(t.description || "");
    setTimeout(() => newTypeNameRef.current?.focus(), 50);
  };

  const handleDeleteType = async (t: any) => {
    if (!confirm(`حذف نوع التغليف "${t.name}"؟`)) return;
    const { error } = await (supabase as any).from("packaging_types").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف نوع التغليف");
    await queryClient.invalidateQueries({ queryKey: ["packaging_types"] });
    if (editingTypeId === t.id) resetTypeForm();
    if (packagingTypeId === t.id) setPackagingTypeId("");
  };

  useEffect(() => { if (open && parentId) loadData();   }, [open, parentId]);

  // المؤشر يبدأ في حقل العدد عند فتح الشاشة بعد التحميل
  useEffect(() => {
    if (open && !loading) {
      const t = setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 100);
      return () => clearTimeout(t);
    }
  }, [open, loading]);

  const loadData = async () => {
    if (!parentId) return;
    setLoading(true);

    const customerJoin = isInvoice ? "*, customers(name, phone)" : "*, customers(name, phone)";
    const { data: p } = await (supabase as any)
      .from(isInvoice ? "invoices" : "quotes")
      .select(customerJoin)
      .eq("id", parentId)
      .single();
    setParent(p);

    // header (single packaging container per document)
    let { data: header } = await (supabase as any)
      .from(parentTable)
      .select("id")
      .eq(idColumn, parentId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!header) {
      const { data: created, error } = await (supabase as any)
        .from(parentTable)
        .insert({ [idColumn]: parentId, quantity: 1 })
        .select("id")
        .single();
      if (error) { toast.error(error.message); setLoading(false); return; }
      header = created;
    }
    setHeaderId(header!.id);

    // packaging items — لا توجد FK في الجدول لذا نتجنب joins ونعتمد على
    // الأعمدة المباشرة (product_name) ونبحث اسم النوع من cache في الواجهة.
    const { data: rows, error: rowsErr } = await (supabase as any)
      .from(itemsTable)
      .select("*")
      .eq(parentFkColumn, header!.id)
      .order("created_at", { ascending: true });
    if (rowsErr) {
      console.error("packaging items load error", rowsErr);
      toast.error("تعذر تحميل بنود التغليف");
    }
    setItems(rows || []);

    // parent document products + quantities
    const { data: docItems } = await (supabase as any)
      .from(itemsParentTable)
      .select("product_id, product_name, quantity")
      .eq(idColumn, parentId);

    const qtyMap: Record<string, number> = {};
    const seen = new Set<string>();
    const list: any[] = [];
    (docItems || []).forEach((it: any) => {
      const key = it.product_id || it.product_name;
      if (it.product_id) {
        qtyMap[it.product_id] = (qtyMap[it.product_id] || 0) + Number(it.quantity || 0);
      }
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push({ id: it.product_id, name: it.product_name });
    });
    setProductQuantities(qtyMap);
    setParentProducts(list);

    // packaged totals per product (across all packaging items for this document)
    const packagedMap: Record<string, number> = {};
    (rows || []).forEach((r: any) => {
      if (!r.product_id) return;
      packagedMap[r.product_id] = (packagedMap[r.product_id] || 0) + Number(r.quantity || 0);
    });
    setPackagedTotals(packagedMap);

    setSelected(new Set());
    setLoading(false);
  };

  // اعرض كل منتجات المستند بدون تقييد بكمية متبقية
  const availableProducts = parentProducts;

  const handleAdd = async (overrideProductValue?: string) => {
    if (!headerId) return;
    const packs = parseInt(quantity) || 1;
    const pieces = parseInt(piecesPerPack) || 1;
    const totalQty = packs * pieces;

    let pid = productId;
    let pname = productName;
    if (overrideProductValue !== undefined) {
      const p = parentProducts.find((x: any) => (x.id || x.name) === overrideProductValue);
      if (p) {
        pid = p.id || "";
        pname = p.name || "";
      }
    }

    if (!quantity || parseInt(quantity) < 1) {
      toast.error("أدخل الكمية");
      return;
    }




    const finalName = pname || parentProducts.find((p: any) => p.id === pid)?.name || null;

    const { error } = await (supabase as any).from(itemsTable).insert({
      [idColumn]: parentId,
      [parentFkColumn]: headerId,
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
    setQuantity(""); setPiecesPerPack(""); setPackagingTypeId(""); setProductId(""); setProductName("");
    await loadData();
    setTimeout(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, 50);

    // ─── أتمتة: إضافة تغليف → الفاتورة جاهزة للرفع تلقائياً ───
    if (isInvoice && parentId) {
      try {
        const { error: rpcErr } = await supabase.rpc("advance_invoice_workflow" as any, {
          _invoice_id: parentId,
          _target: "ready_to_ship",
          _reason: "إضافة تغليف",
        });
        if (rpcErr) {
          // غير حرجة لمسار الإضافة، لكن يجب أن تظهر في السجل لمنع التشخيص الأعمى.
          console.warn("[PackagingDialog.add] advance_workflow failed:", rpcErr);
        }
        invalidateWorkflowAutoCache(parentId);
        try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
      } catch (e) {
        console.warn("[PackagingDialog.add] advance_workflow threw:", e);
      }
    }
  };

  const handleDelete = async (rowId: string) => {
    if (!confirm("حذف هذا البند؟")) return;
    const { error } = await (supabase as any).from(itemsTable).delete().eq("id", rowId);
    if (error) {
      console.error("[PackagingDialog.handleDelete] failed:", error);
      toast.error(`تعذّر الحذف: ${error.message}`);
      return;
    }
    toast.success("تم الحذف");
    loadData();
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} بند؟`)) return;
    const { error } = await (supabase as any).from(itemsTable).delete().in("id", Array.from(selected));
    if (error) {
      console.error("[PackagingDialog.handleDeleteSelected] failed:", error);
      toast.error(`تعذّر حذف المحدد: ${error.message}`);
      return;
    }
    toast.success("تم حذف المحدد");
    loadData();
  };

  const handleSave = async () => {
    toast.success("تم حفظ التغليف");
    // أتمتة إضافية: حفظ يُؤكد الحالة ready_to_ship أيضاً
    if (isInvoice && parentId) {
      try {
        const { error: rpcErr } = await supabase.rpc("advance_invoice_workflow" as any, {
          _invoice_id: parentId,
          _target: "ready_to_ship",
          _reason: "حفظ التغليف",
        });
        if (rpcErr) {
          console.warn("[PackagingDialog.save] advance_workflow failed:", rpcErr);
        }
        invalidateWorkflowAutoCache(parentId);
        try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
      } catch (e) {
        console.warn("[PackagingDialog.save] advance_workflow threw:", e);
      }
    }
  };

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
      const hay = normalize([
        it.packaging_types?.name,
        it.quantity,
        it.product_name,
        it.products?.name,
      ].join(" "));
      return tokens.every((t) => hay.includes(t));
    });
  }, [items, search]);

  const showAll = perPage === -1;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginated = showAll ? filtered : filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const fromIdx = filtered.length === 0 ? 0 : showAll ? 1 : (safePage - 1) * perPage + 1;
  const toIdx = showAll ? filtered.length : Math.min(safePage * perPage, filtered.length);

  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  const totalQtyAll = items.reduce((s, it) => s + Number(it.quantity || 0), 0);

  const docTitle = isInvoice ? "إدارة تغليف الفاتورة" : "إدارة تغليف عرض السعر";
  const docNumberLabel = isInvoice ? "رقم الفاتورة" : "رقم العرض";
  const docDateLabel = isInvoice ? "تاريخ الفاتورة" : "تاريخ العرض";
  const docNumber = parent?.[parentNumberField];

  // Resizable dialog size (persisted per user)
  const { dlgRef, dlgStyle } = useDialogSize("pkg_dialog", open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dlgRef as any}
        className="max-w-none p-0 overflow-hidden flex flex-col"
        style={dlgStyle}
        dir="rtl"
      >
        <article className="content packaging-grid" style={{ padding: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="legacy-card card-block" style={{ margin: 0, border: 0, boxShadow: "none", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            {loading ? (
              <div style={{ textAlign: "center", padding: "3rem" }}>جارٍ التحميل...</div>
            ) : (
              <div className="grid_3 grid_4" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <div className="pkg-sticky-top" style={{ padding: "6px 10px 4px" }}>
                <div className="header-block" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <h3 className="title" style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span>{docTitle} #{docNumber}</span>
                    <button
                      onClick={() => {
                        if (!parentId) return;
                        const path = isInvoice
                          ? `/preview/invoice/${parentId}/packaging`
                          : `/preview/quote/${parentId}/packaging`;
                        navigate(path);
                      }}
                      className="legacy-btn legacy-btn-primary btn-sm"
                      style={{ height: 24, padding: "0 8px", fontSize: 11 }}
                      title="فتح معاينة التقرير لاختيار الأعمدة وطريقة الإرسال"
                    >
                      <Printer /> طباعة
                    </button>
                    <button onClick={handleSave} className="legacy-btn legacy-btn-success btn-sm" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>
                      <Save /> حفظ
                    </button>
                  </h3>
                </div>

                {/* Info strip — مضغوط */}
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "hsl(var(--muted) / 0.4)",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 3,
                  padding: "2px 8px",
                  margin: "4px 0",
                  fontSize: 11,
                  lineHeight: 1.3,
                }}>
                  <span><span style={{ color: "hsl(var(--muted-foreground))" }}>{docNumberLabel}: </span><strong>#{docNumber}</strong></span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span><span style={{ color: "hsl(var(--muted-foreground))" }}>العميل: </span><strong>{parent?.customers?.name || "—"}</strong></span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span><span style={{ color: "hsl(var(--muted-foreground))" }}>{docDateLabel}: </span><strong>{parent?.date}</strong></span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span><span style={{ color: "hsl(var(--muted-foreground))" }}>الإجمالي: </span><strong>{Number(parent?.total || 0).toLocaleString()} {parent?.currency_code || "SDG"}</strong></span>
                </div>

                {/* Add form — شريط مضغوط (responsive: متعدد الأسطر على الموبايل) */}
                <div className="legacy-form-horizontal pkg-add-form" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, padding: "6px 8px", marginBottom: "6px" }}>
                  <style>{`
                    .pkg-add-form .pkg-add-grid {
                      display: grid;
                      grid-template-columns: auto 40px 2.2fr 1.8fr auto 50px auto;
                      gap: 0.4rem;
                      align-items: center;
                    }
                    @media (max-width: 720px) {
                      .pkg-add-form .pkg-add-grid {
                        grid-template-columns: 60px 1fr;
                        gap: 6px 8px;
                        align-items: center;
                      }
                      .pkg-add-form .pkg-add-grid > .pkg-full { grid-column: 1 / -1; }
                      .pkg-add-form .pkg-add-grid .legacy-control { width: 100%; }
                    }
                  `}</style>
                  <div className="pkg-add-grid">
                    <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>العدد</label>
                    <input
                      ref={qtyRef}
                      type="number"
                      className="legacy-control"
                      value={quantity}
                      min={1}
                      maxLength={2}
                      onChange={(e) => setQuantity(e.target.value.slice(0, 2))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); typeSearchRef.current?.focus(); } }}
                    />
                    <div className="pkg-full" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <SearchableSelect
                        inputRef={typeSearchRef}
                        value={packagingTypeId}
                        placeholder="نوع التغليف..."
                        options={(packagingTypes as any[] || []).map((t: any) => ({ value: t.id, label: t.name }))}
                        allowEmpty
                        onCreate={async (name) => {
                          const { data, error } = await (supabase as any)
                            .from("packaging_types")
                            .insert({ name })
                            .select("id")
                            .single();
                          if (error) { toast.error(error.message); return; }
                          toast.success("تم إضافة نوع التغليف");
                          await queryClient.invalidateQueries({ queryKey: ["packaging_types"] });
                          if (data?.id) setPackagingTypeId(data.id);
                          setTimeout(() => productSearchRef.current?.focus(), 50);
                        }}
                        onSelect={(opt) => {
                          setPackagingTypeId(opt.value);
                          setTimeout(() => productSearchRef.current?.focus(), 50);
                        }}
                        onTab={() => productSearchRef.current?.focus()}
                      />
                      <button
                        type="button"
                        onClick={() => { setNewTypeOpen(true); setTimeout(() => newTypeNameRef.current?.focus(), 100); }}
                        className="legacy-btn legacy-btn-success btn-sm"
                        title="إضافة نوع تغليف جديد"
                        style={{ padding: "0 3px", height: 20, minWidth: 20 }}
                      >
                        <Plus style={{ width: 11, height: 11 }} />
                      </button>
                    </div>
                    <div className="pkg-full">
                    <SearchableSelect
                      inputRef={productSearchRef}
                      value={productId || productName}
                      placeholder={`منتجات ${isInvoice ? "الفاتورة" : "العرض"}...`}
                      options={availableProducts.map((p: any) => ({
                        value: p.id || p.name,
                        label: p.name,
                      }))}
                      allowEmpty
                      onSelect={(opt) => {
                        const p = parentProducts.find((x: any) => (x.id || x.name) === opt.value);
                        if (p) { setProductId(p.id || ""); setProductName(p.name || ""); }
                        else { setProductId(""); setProductName(""); }
                        setTimeout(() => { piecesRef.current?.focus(); piecesRef.current?.select(); }, 50);
                      }}
                      onTab={() => { piecesRef.current?.focus(); piecesRef.current?.select(); }}
                    />
                    </div>
                    <label style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }}>قطع/نوع</label>
                    <input
                      ref={piecesRef}
                      type="number"
                      className="legacy-control"
                      value={piecesPerPack}
                      min={1}
                      maxLength={3}
                      onChange={(e) => setPiecesPerPack(e.target.value.slice(0, 3))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                    />
                    <button onClick={() => handleAdd()} className="legacy-btn legacy-btn-primary btn-sm" style={{ padding: "0 6px", fontSize: 11 }}>
                      <Plus style={{ width: 12, height: 12 }} /> إضافة
                    </button>
                  </div>
                </div>
                </div>
                {/* /pkg-sticky-top */}

                <div className="pkg-scroll neo-pkg-scope" style={{ padding: "0 10px", flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>

                {/* Items table */}
                {(() => {
                  const colDefs = [40, 50, 70, null, null, 90] as (number | null)[];
                  const fallback = colDefs.map((w) => w ?? 180);
                  const totalW = fallback.reduce((s, v) => s + v, 0);
                  return (
                <table className="excel-table" style={{ width: "100%", tableLayout: "fixed" }}>
                  <colgroup>
                    {colDefs.map((w, i) => (
                      <col key={i} style={{ width: `${(fallback[i] / totalW) * 100}%` }} />
                    ))}
                  </colgroup>
                  <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--primary))" }}>
                    <tr className="item_header">
                      <th className="text-center">
                        <input
                          type="checkbox"
                          checked={items.length > 0 && selected.size === items.length}
                          onChange={(e) => setSelected(e.target.checked ? new Set(items.map(i => i.id)) : new Set())}
                        />
                      </th>
                      <th className="text-center">#</th>
                      <th className="text-center">العدد</th>
                      <th>نوع التغليف</th>
                      <th>اسم المنتج</th>
                      <th className="text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((it, i) => {
                      const packs = Number(it.packs_count ?? 1);
                      const pieces = Number(it.pieces_per_pack ?? it.quantity ?? 1);
                      const isFocused = focusedRowId === it.id;
                      return (
                        <tr
                          key={it.id}
                          tabIndex={0}
                          data-row-id={it.id}
                          onClick={(e) => {
                            setFocusedRowId(it.id);
                            (e.currentTarget as HTMLElement).focus();
                          }}
                          onFocus={() => setFocusedRowId(it.id)}
                          onKeyDown={(e) => {
                            const tag = (e.target as HTMLElement).tagName;
                            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              const next = paginated[i + 1];
                              if (next) {
                                setFocusedRowId(next.id);
                                const el = document.querySelector<HTMLElement>(`tr[data-row-id="${next.id}"]`);
                                el?.focus();
                              }
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              const prev = paginated[i - 1];
                              if (prev) {
                                setFocusedRowId(prev.id);
                                const el = document.querySelector<HTMLElement>(`tr[data-row-id="${prev.id}"]`);
                                el?.focus();
                              }
                            } else if (e.key === " " || e.code === "Space") {
                              e.preventDefault();
                              toggleSelect(it.id);
                            } else if (e.key === "Delete") {
                              e.preventDefault();
                              const nextRow = paginated[i + 1] || paginated[i - 1];
                              if (selected.size > 0) {
                                handleDeleteSelected();
                              } else {
                                handleDelete(it.id);
                              }
                              if (nextRow) {
                                setFocusedRowId(nextRow.id);
                                setTimeout(() => {
                                  document.querySelector<HTMLElement>(`tr[data-row-id="${nextRow.id}"]`)?.focus();
                                }, 50);
                              }
                            }
                          }}
                          style={isFocused ? { background: "hsl(var(--accent) / 0.3)", outline: "none" } : undefined}
                        >
                          <td className="text-center">
                            <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSelect(it.id)} />
                          </td>
                          <td className="text-center">{(showAll ? 0 : (safePage - 1) * perPage) + i + 1}</td>
                          <td className="text-center">{packs}</td>
                           <td>{(packagingTypes as any[] || []).find((t: any) => t.id === it.packaging_type_id)?.name || it.packaging_types?.name || "—"}</td>
                           <td>{it.product_name || it.products?.name || "—"}{pieces > 1 ? <> {" — "}<span style={{ color: "hsl(var(--primary))", fontWeight: 700 }}>× {pieces}</span></> : null}</td>
                          <td className="text-center">
                            <button onClick={() => handleDelete(it.id)} className="legacy-btn legacy-btn-danger btn-sm" title="حذف">
                              <Trash2 />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                  );
                })()}
                </div>
                {/* /pkg-scroll */}

                <div className="pkg-sticky-bottom" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", fontSize: 11, padding: "4px 10px", borderTop: "1px solid hsl(var(--border))", background: "hsl(var(--muted) / 0.5)" }}>
                  <div className="legacy-dt-info" style={{ fontWeight: 600 }}>
                    إظهار {fromIdx} إلى {toIdx} من أصل {filtered.length} مدخل · إجمالي القطع: <span style={{ color: "hsl(var(--primary))" }}>{totalQtyAll}</span>
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
                        <li className="page-item active">
                          <span className="page-link">{safePage} / {totalPages}</span>
                        </li>
                        <li className={`page-item ${safePage === totalPages ? "disabled" : ""}`}>
                          <button className="page-link" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>التالي</button>
                        </li>
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </article>
      </DialogContent>

      {/* Manage packaging types modal */}
      <Dialog open={newTypeOpen} onOpenChange={(v) => { setNewTypeOpen(v); if (!v) resetTypeForm(); }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>إدارة أنواع التغليف</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {editingTypeId ? "تعديل اسم النوع" : "اسم نوع التغليف *"}
                </label>
                <input
                  ref={newTypeNameRef}
                  type="text"
                  className="legacy-control"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveType(); } }}
                  placeholder="مثلاً: كرتونة كبيرة"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">الوصف (اختياري)</label>
                <input
                  type="text"
                  className="legacy-control"
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSaveType(); } }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {editingTypeId && (
                <button onClick={resetTypeForm} className="legacy-btn legacy-btn-default btn-sm">
                  إلغاء التعديل
                </button>
              )}
              <button onClick={handleSaveType} className="legacy-btn legacy-btn-primary btn-sm">
                <Plus /> {editingTypeId ? "تحديث" : "إضافة"}
              </button>
            </div>

            <div style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 8 }}>
              <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 6 }}>
                الأنواع الموجودة ({(packagingTypes as any[] || []).length})
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid hsl(var(--border))", borderRadius: 6 }}>
                <table className="legacy-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>الاسم</th>
                      <th>الوصف</th>
                      <th className="text-center" style={{ width: 110 }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(packagingTypes as any[] || []).length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: "center", padding: "1rem" }}>لا توجد أنواع</td></tr>
                    ) : (packagingTypes as any[]).map((t: any) => (
                      <tr key={t.id} style={{ background: editingTypeId === t.id ? "hsl(var(--accent) / 0.3)" : undefined }}>
                        <td>{t.name}</td>
                        <td style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>{t.description || "—"}</td>
                        <td className="text-center">
                          <div style={{ display: "inline-flex", gap: 4 }}>
                            <button onClick={() => handleEditType(t)} className="legacy-btn legacy-btn-default btn-sm" title="تعديل">
                              تعديل
                            </button>
                            <button onClick={() => handleDeleteType(t)} className="legacy-btn legacy-btn-danger btn-sm" title="حذف">
                              <Trash2 />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => { setNewTypeOpen(false); resetTypeForm(); }} className="legacy-btn legacy-btn-default btn-sm">إغلاق</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
