import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { startsWithAny, startsWithMatch } from "@/utils/searchMatch";
import { Plus, Image as ImageIcon, StickyNote, Printer, Save, ArrowRight } from "lucide-react";
import StatusButton, { PURCHASE_STATUS_OPTIONS } from "@/components/StatusButton";
import { useSuppliers, useProductsWithDetails, useWarehouses, useCompanySettings } from "@/hooks/useData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import RecentItemsSidebar from "@/components/RecentItemsSidebar";
import PanelResizer from "@/components/PanelResizer";
import RowResizer from "@/components/RowResizer";
import PurchaseAttachmentsDialog from "@/components/purchase/PurchaseAttachmentsDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import QuickAddProductDialog from "@/components/product/QuickAddProductDialog";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import { receiveStockForPurchaseOnce, applyStockDeltaForPurchaseLines, getPurchaseStatus, addStockForLines } from "@/utils/stockReceive";
import PrintMenu, { type PrintVariant } from "@/components/PrintMenu";
import { useScreenZoom } from "@/hooks/useScreenZoom";
import { useColumnWidths, useContainerFit, ColumnResizeHandle, useScreenColsLocked, screenColWidthsKey, migrateScreenColKeys, COLS_TOAST_SAVED, COLS_TOAST_SAVE_FAILED, COLS_TOAST_EDIT_MODE, COLS_BTN_SAVE_LABEL, COLS_BTN_EDIT_LABEL, COLS_BTN_SAVE_TITLE, COLS_BTN_EDIT_TITLE } from "@/hooks/useColumnWidths";
import { useSuggestionsWidth, SuggestionsResizeHandle } from "@/hooks/useSuggestionsWidth";
import { SuggestionsPortal } from "@/components/SuggestionsPortal";
import { ItemsScroll } from "@/components/items/ItemsScroll";
import { makeRowNavHandler } from "@/utils/itemTableNav";
import { useCreatePageNav } from "@/utils/createPageNav";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";
import { useQuickRowWidths, ExpandFieldButton } from "@/hooks/useQuickRowWidths";
import { CustomerInfoStrip } from "@/utils/balanceDisplay";
import FreePositionToolbar from "@/components/toolbar/FreePositionToolbar";
import SummaryChip from "@/components/toolbar/SummaryChip";
import { ToolbarCustomizationProvider } from "@/components/toolbar/ToolbarCustomizationContext";
import MessageImportDialog, { MessageImportButton } from "@/components/MessageImportDialog";
import type { ParsedLine } from "@/hooks/useMessageImport";

interface PurchaseRow {
  uid: string;
  dbId?: string | null;
  product_id: string | null;
  product_name: string;
  productSearch: string;
  quantity: number;
  unit_price: number;
  foreign_price: number;
  discount: number;
  discount_amount: number;
  total: number;
  showSuggestions: boolean;
  selected: boolean;
  unit?: string | null;
}

const EMPTY_ROWS = 10;

function newRow(): PurchaseRow {
  return {
    uid: crypto.randomUUID(),
    product_id: null,
    product_name: "",
    productSearch: "",
    quantity: 1,
    unit_price: 0,
    foreign_price: 0,
    discount: 0,
    discount_amount: 0,
    total: 0,
    showSuggestions: false,
    selected: false,
  };
}

function recalcRow(r: PurchaseRow): PurchaseRow {
  const base = (r.quantity || 0) * (r.unit_price || 0);
  const discAmt = base * (r.discount || 0) / 100;
  return { ...r, discount_amount: discAmt, total: Math.round((base - discAmt) * 100) / 100 };
}

function useKeyboardNav(rootRef: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !root.contains(target)) return;
      const tag = target.tagName;
      if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") return;
      if (tag === "TEXTAREA" && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;

      const container = target.closest(".product-search-container, .has-suggestions") as HTMLElement | null;
      const list = (container?.querySelector(".search-suggestions, .customer-suggestions")
        || document.querySelector(".search-suggestions")) as HTMLElement | null;
      if (list) {
        const items = Array.from(list.querySelectorAll<HTMLElement>("[data-sugg-item]"));
        if (items.length) {
          const currentIdx = items.findIndex((el) => el.getAttribute("data-active") === "true");
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
            items.forEach((el, i) => el.setAttribute("data-active", i === next ? "true" : "false"));
            items[next].scrollIntoView({ block: "nearest" });
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
            items.forEach((el, i) => el.setAttribute("data-active", i === next ? "true" : "false"));
            items[next].scrollIntoView({ block: "nearest" });
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const pick = currentIdx >= 0 ? items[currentIdx] : items[0];
            pick.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            return;
          }
        }
      }

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])"),
      ).filter((el) => el.offsetParent !== null);
      const idx = focusables.indexOf(target);
      if (idx === -1) return;

      let nextEl: HTMLElement | null = null;

      // Up/Down داخل شريط الإضافة السريع: تنقّل بدل تغيير قيمة input[type=number]
      const inQuickAdd = !!target.closest(".quick-add-row");
      if (inQuickAdd && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const col = target.getAttribute("data-nav-col");
        let candidate: HTMLElement | null = null;
        if (e.key === "ArrowDown") {
          const quickAddEl = target.closest(".quick-add-row") as HTMLElement | null;
          if (col !== "product" && quickAddEl) {
            candidate = quickAddEl.querySelector<HTMLElement>('[data-nav-col="product"]');
          }
          if (!candidate) {
            if (col) candidate = root.querySelector<HTMLElement>(`[data-nav-table][data-nav-col="${col}"]`);
            if (!candidate) candidate = root.querySelector<HTMLElement>("[data-nav-table]");
          }
        } else {
          for (let i = idx - 1; i >= 0; i--) {
            if (!focusables[i].closest(".quick-add-row")) { candidate = focusables[i]; break; }
          }
        }
        e.preventDefault();
        if (candidate) {
          candidate.focus();
          if (candidate instanceof HTMLInputElement && (candidate.type === "text" || candidate.type === "number")) candidate.select();
        }
        return;
      }

      // Up/Down داخل صفوف جدول البنود: تنقّل عمودي بين الصفوف بنفس العمود
      const navTable = target.getAttribute("data-nav-table");
      const navRowAttr = target.getAttribute("data-nav-row");
      const navCol = target.getAttribute("data-nav-col");
      if (navTable && navRowAttr !== null && navCol && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const curRow = parseInt(navRowAttr, 10);
        let candidate: HTMLElement | null = null;
        if (e.key === "ArrowDown") {
          candidate = root.querySelector<HTMLElement>(`[data-nav-table="${navTable}"][data-nav-row="${curRow + 1}"][data-nav-col="${navCol}"]`);
        } else {
          if (curRow > 0) {
            candidate = root.querySelector<HTMLElement>(`[data-nav-table="${navTable}"][data-nav-row="${curRow - 1}"][data-nav-col="${navCol}"]`);
          } else {
            candidate = root.querySelector<HTMLElement>(`.quick-add-row [data-nav-col="${navCol}"]`);
          }
        }
        e.preventDefault();
        if (candidate) {
          candidate.focus();
          if (candidate instanceof HTMLInputElement && (candidate.type === "text" || candidate.type === "number")) candidate.select();
        }
        return;
      }

      if (e.key === "Enter") nextEl = focusables[idx + 1] || null;
      else return;

      if (nextEl) {
        e.preventDefault();
        nextEl.focus();
        if (nextEl instanceof HTMLInputElement && (nextEl.type === "text" || nextEl.type === "number")) nextEl.select();
      }
    };
    root.addEventListener("keydown", handler);
    return () => root.removeEventListener("keydown", handler);
  }, [rootRef]);
}

const btnStyle = (bg: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
  background: bg, color: "#fff", border: "none",
  borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
  cursor: "pointer", height: 26, lineHeight: 1.1, whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
});

export default function PurchaseCreatePage() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  // One-time reset of saved toolbar positions for this screen
  useEffect(() => {
    const flag = "neobilling:toolbar-reset:purchase-create:v3";
    if (localStorage.getItem(flag)) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("neobilling:toolbar-positions:v1:") && k.endsWith(":purchase-create-toolbar")) {
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(flag, "1");
    window.location.reload();
  }, []);
  const { zoom: itemsZoom, inc: itemsZoomInc, dec: itemsZoomDec } = useScreenZoom("purchase-create");
  // Unified item-table columns: [action, product(flex), qty, foreign$, price, total, trailing]
  const colsScreenId = "purchase-create";
  if (typeof window !== "undefined") migrateScreenColKeys(colsScreenId);
  const [colsLocked, setColsLocked] = useScreenColsLocked(colsScreenId);
  const { widths: colWidths, minWidths: colMinWidths, startDrag: startColDrag, tableProps, clampWidthsToContainer } = useColumnWidths(
    screenColWidthsKey(colsScreenId),
    [36, null, 80, 100, 100, 100, 36, 40],
    colsLocked,
  );
  const { width: suggWidth, startDrag: startSuggDrag } = useSuggestionsWidth("purchase-create:suggWidth");
  const QUICK_BASE_PURCHASE = ["3fr", "80px", "110px", "110px", "auto"];
  const { extras: quickExtras, setExtra: quickSetExtra, reset: quickReset, getGridTemplate: quickGrid } = useQuickRowWidths("purchase-create:quickRowWidths", 4);
  const SUPPLIER_FIELD_BASE = 260;
  const { extras: supExtras, setExtra: supSetExtra, reset: supReset } = useQuickRowWidths("purchase-create:supplierFieldWidth", 1);
  // Header field widths (date, expected, warehouse, supplier invoice#)
  const HEADER_FIELD_BASES = [130, 130, 140, 140, 130, 120];
  const { extras: hdrExtras, setExtra: hdrSetExtra, reset: hdrReset } = useQuickRowWidths("purchase-create:headerFieldsWidth", 5);
  const isEdit = Boolean(editId);
  const pageRef = useRef<HTMLDivElement>(null);
  useKeyboardNav(pageRef);

  const queryClient = useQueryClient();
  const { data: suppliers } = useSuppliers();
  const { data: products } = useProductsWithDetails();
  const { data: warehouses } = useWarehouses();
  const { data: companyArr } = useCompanySettings();
  const company = companyArr?.[0] || null;

  const [orderId, setOrderId] = useState<string | null>(editId || null);
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [userNote, setUserNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("pending");

  const [defaultRate, setDefaultRate] = useState<number>(1);

  const [quickRow, setQuickRow] = useState<PurchaseRow>(newRow());
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const itemsScrollRef = useRef<HTMLDivElement>(null);
  useContainerFit(itemsScrollRef, clampWidthsToContainer, { locked: colsLocked });
  const prevRowsLen = useRef(1);
  useEffect(() => {
    if (rows.length > prevRowsLen.current && itemsScrollRef.current) {
      const el = itemsScrollRef.current;
      requestAnimationFrame(() => {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
        else el.scrollTop = 0;
      });
    }
    prevRowsLen.current = rows.length;
  }, [rows.length]);
  const [tableSearch, setTableSearch] = useState("");
  const [productHeaderSearch, setProductHeaderSearch] = useState(false);

  const [attachOpen, setAttachOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const emptySupplierForm = { name: "", phone: "", address: "", notes: "" };
  const [newSupplier, setNewSupplier] = useState(emptySupplierForm);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [showMessageImport, setShowMessageImport] = useState(false);

  const supplierInputRef = useRef<HTMLInputElement>(null);
  const quickProductRef = useRef<HTMLInputElement>(null);
  const quickQtyRef = useRef<HTMLInputElement>(null);
  useCreatePageNav({ rootRef: pageRef, customerRef: supplierInputRef, itemsTableId: "purchase-items" });

  useEffect(() => {
    (async () => {
      const { data: er } = await supabase
        .from("exchange_rates")
        .select("rate_to_base")
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rate = Number(er?.rate_to_base || 1);
      if (rate && rate > 0) setDefaultRate(rate);
    })();
  }, []);

  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
    };
    window.addEventListener("products:changed", handleSync);
    window.addEventListener("suppliers:changed", handleSync);
    window.addEventListener("focus", handleSync);
    return () => {
      window.removeEventListener("products:changed", handleSync);
      window.removeEventListener("suppliers:changed", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data: order } = await (supabase as any).from("purchase_orders").select("*").eq("id", editId).maybeSingle();
      if (!order) { toast.error("لم يتم العثور على الأمر"); return; }
      setOrderNumber(order.order_number || "");
      setSupplierId(order.supplier_id || "");
      setWarehouseId(order.warehouse_id || "");
      setPurchaseDate(order.date || "");
      setExpectedDate(order.expected_delivery_date || "");
      setSupplierInvoiceNumber(order.supplier_invoice_number || "");
      setNotes(order.notes || "");
      setUserNote(order.user_note || "");
      setStatus(order.status || "pending");

      const { data: itemsData } = await supabase.from("purchase_order_items").select("*").eq("purchase_order_id", editId);
      if (itemsData && itemsData.length) {
        const loaded: PurchaseRow[] = (itemsData as any[]).map((it) => recalcRow({
          ...newRow(),
          dbId: it.id,
          product_id: it.product_id || null,
          product_name: it.product_name,
          productSearch: it.product_name,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          foreign_price: Number(it.foreign_price || 0),
          discount: Number(it.discount || 0),
        }));
        setRows(loaded);
      }
    })();
  }, [editId]);

  useEffect(() => {
    if (supplierId && suppliers) {
      const s = (suppliers as any[]).find((x) => x.id === supplierId);
      if (s) { setSelectedSupplier(s); setSupplierSearch(s.name); }
    }
  }, [supplierId, suppliers]);

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return [];
    return (suppliers || []).filter((s: any) =>
      startsWithAny([s.name, s.phone], supplierSearch)
    ).slice(0, 8);
  }, [supplierSearch, suppliers]);

  function productMatches(query: string, excludeRowUid?: string): any[] {
    if (!query.trim()) return [];
    const usedIds = new Set(
      rows.filter((r) => r.product_id && r.uid !== excludeRowUid).map((r) => r.product_id),
    );
    return (products || []).filter((p: any) => {
      if (usedIds.has(p.id)) return false;
      const m = startsWithAny([p.name, p.sku], query);
      if (!warehouseId) return m;
      return m && p.warehouse_id === warehouseId;
    }).slice(0, 10);
  }

  function focusRowSearch(rowUid: string) {
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`input[data-row-search="${rowUid}"]`);
      el?.focus();
      el?.select();
    }, 50);
  }

  function selectSupplier(s: any) {
    setSupplierId(s.id);
    setSelectedSupplier(s);
    setSupplierSearch(s.name);
    setShowSupplierDropdown(false);
    setTimeout(() => quickProductRef.current?.focus(), 0);
  }

  function pickProductIntoRow(rowUid: string, p: any) {
    const exists = rows.some((r) => r.product_id === p.id && r.uid !== rowUid);
    if (exists) {
      toast.error(`الصنف "${p.name}" مُضاف مسبقاً`);
      setRows((prev) => prev.map((r) => (r.uid === rowUid ? { ...r, productSearch: "", showSuggestions: false } : r)));
      focusRowSearch(rowUid);
      return;
    }
    const fp = Number(p.foreign_price || 0);
    const price = fp > 0 ? fp * defaultRate : Number(p.purchase_price || 0);
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.uid !== rowUid) return r;
        return recalcRow({
          ...r,
          product_id: p.id,
          product_name: p.name,
          productSearch: p.name,
          unit_price: price,
          foreign_price: fp,
          unit: p.unit || r.unit,
          discount: 0,
          showSuggestions: false,
        });
      });
      return updated;
    });
  }

  function pickProductIntoQuick(p: any) {
    const exists = rows.some((r) => r.product_id === p.id);
    if (exists) {
      toast.error(`الصنف "${p.name}" مُضاف مسبقاً`);
      setQuickRow((r) => ({ ...r, productSearch: "", showSuggestions: false }));
      setTimeout(() => quickProductRef.current?.focus(), 50);
      return;
    }
    const fp = Number(p.foreign_price || 0);
    const price = fp > 0 ? fp * defaultRate : Number(p.purchase_price || 0);
    setQuickRow((r) => recalcRow({
      ...r,
      product_id: p.id,
      product_name: p.name,
      productSearch: p.name,
      unit_price: price,
      foreign_price: fp,
      unit: p.unit || r.unit,
      discount: 0,
      quantity: 0,
      showSuggestions: false,
    }));
    setTimeout(() => quickQtyRef.current?.focus(), 0);
  }

  function updateRow(uid: string, patch: Partial<PurchaseRow>) {
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r;
      const merged = { ...r, ...patch };
      if (patch.foreign_price != null) {
        const fp = Number(patch.foreign_price) || 0;
        if (fp > 0) merged.unit_price = fp * defaultRate;
      }
      return recalcRow(merged);
    }));
  }

  function addQuickRowToTable() {
    if (!quickRow.product_id) {
      toast.error("اختر منتجاً أولاً");
      quickProductRef.current?.focus();
      return;
    }
    const addQty = Number(quickRow.quantity) || 1;
    setRows((prev) => {
      const existingIdx = prev.findIndex((r) => r.product_id && r.product_id === quickRow.product_id);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = recalcRow({ ...copy[existingIdx], quantity: (Number(copy[existingIdx].quantity) || 0) + addQty });
        toast.info("تم زيادة الكمية للمنتج الموجود");
        return copy;
      }
      const newItem = recalcRow({ ...quickRow, uid: crypto.randomUUID(), quantity: addQty });
      return [...prev, newItem];
    });
    setQuickRow(newRow());
    setTimeout(() => quickProductRef.current?.focus(), 0);
  }

  async function removeRow(uid: string) {
    const target = rows.find((r) => r.uid === uid);
    if (!target) return;
    if (target.dbId && editId) {
      try {
        const { error } = await supabase.from("purchase_order_items").delete().eq("id", target.dbId);
        if (error) throw error;
        toast.success("تم حذف البند");
      } catch (e: any) {
        toast.error(e?.message || "فشل حذف البند");
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  }
  const { isPending: isSpacePending, handleRowKeyDown: handleSpaceDelete } = useSpaceToDelete(removeRow);

  function deleteSelectedRows() {
    setRows((prev) => prev.filter((r) => !r.selected));
  }
  function toggleSelectAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected: checked })));
  }

  const totals = useMemo(() => {
    const valid = rows.filter((r) => r.product_id);
    const subtotal = valid.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const discountTotal = valid.reduce((s, it) => s + it.discount_amount, 0);
    return {
      count: valid.length,
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: 0,
      discountTotal: Math.round(discountTotal * 100) / 100,
      grandTotal: Math.round((subtotal - discountTotal) * 100) / 100,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!tableSearch.trim()) return rows;
    return rows.filter((r) => !r.product_id || startsWithMatch(r.product_name, tableSearch));
  }, [rows, tableSearch]);

  async function handleCreateSupplier() {
    if (!newSupplier.name.trim()) { toast.error("الاسم مطلوب"); return; }
    setSavingSupplier(true);
    const { data, error } = await (supabase as any).from("suppliers").insert(newSupplier).select().single();
    setSavingSupplier(false);
    if (error) { toast.error(error.message); return; }
    selectSupplier(data);
    setAddSupplierOpen(false);
    setNewSupplier(emptySupplierForm);
    // إبطال كاش الموردين + إخطار الشاشات الأخرى
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    try { window.dispatchEvent(new Event("suppliers:changed")); } catch {}
    toast.success("تم إضافة المورد");
  }

  async function handleSubmit(alsoReceive = false) {
    if (!supplierId) { toast.error("اختر المورد"); return; }
    const valid = rows.filter((r) => r.product_id);
    if (valid.length === 0) { toast.error("أضف منتج واحد على الأقل"); return; }

    setSaving(true);
    try {
      let savedId = orderId;
      let savedNumber = orderNumber;

      const payload: any = {
        supplier_id: supplierId,
        warehouse_id: warehouseId || null,
        date: purchaseDate,
        expected_delivery_date: expectedDate || null,
        supplier_invoice_number: supplierInvoiceNumber || null,
        subtotal: totals.subtotal,
        discount: totals.discountTotal,
        total: totals.grandTotal,
        notes,
        user_note: userNote,
        status: alsoReceive ? "received" : status,
      };

      // Snapshot existing state BEFORE mutating, so we can compute stock deltas correctly.
      let prevStatusInDb: string | null = null;
      let prevItems: Array<{ product_id: string | null; quantity: number }> = [];
      if (isEdit && orderId) {
        prevStatusInDb = await getPurchaseStatus(orderId);
        const { data: prevItemsRows } = await supabase
          .from("purchase_order_items")
          .select("product_id, quantity")
          .eq("purchase_order_id", orderId);
        prevItems = (prevItemsRows || []).map((r: any) => ({
          product_id: r.product_id, quantity: Number(r.quantity || 0),
        }));

        const { error } = await (supabase as any).from("purchase_orders").update(payload).eq("id", orderId);
        if (error) throw error;
        await supabase.from("purchase_order_items").delete().eq("purchase_order_id", orderId);
      } else {
        const prefix = company?.purchase_prefix || "PO-";
        // initial candidate based on max existing number
        const buildNextNumber = async (): Promise<string> => {
          const { data: rows } = await supabase
            .from("purchase_orders")
            .select("order_number")
            .like("order_number", `${prefix}%`);
          let maxN = 0;
          (rows || []).forEach((r: any) => {
            const after = String(r.order_number || "").slice(prefix.length);
            const mm = after.match(/^(\d+)/);
            const n = mm ? parseInt(mm[1]) : 0;
            if (n > maxN) maxN = n;
          });
          return `${prefix}${String(maxN + 1).padStart(4, "0")}`;
        };
        let candidate = orderNumber && orderNumber.startsWith(prefix) ? orderNumber : await buildNextNumber();
        let attempt = 0;
        let createdRow: any = null;
        while (attempt < 5) {
          const tryPayload = { ...payload, order_number: candidate };
          const { data: created, error } = await (supabase as any)
            .from("purchase_orders")
            .insert(tryPayload)
            .select()
            .single();
          if (!error) { createdRow = created; break; }
          const isDup = (error as any).code === "23505" || /duplicate key|purchase_orders_order_number_key/i.test(error.message || "");
          if (!isDup) throw error;
          candidate = await buildNextNumber();
          attempt++;
        }
        if (!createdRow) throw new Error("تعذّر توليد رقم أمر شراء فريد، حاول مرة أخرى");
        if (candidate !== orderNumber) {
          toast.message(`تم تعديل رقم أمر الشراء إلى ${candidate} لتفادي التكرار`);
        }
        savedNumber = candidate;
        savedId = createdRow.id;
        setOrderId(savedId);
        setOrderNumber(savedNumber);
      }

      const itemsPayload = valid.map((it) => ({
        purchase_order_id: savedId,
        product_id: it.product_id || null,
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        foreign_price: it.foreign_price,
        discount: it.discount,
        total: it.total,
      }));
      const { error: itemsErr } = await (supabase as any).from("purchase_order_items").insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // ── Stock sync ───────────────────────────────────────────────────────
      // Three cases:
      //  A) was NOT completed and now becoming completed → add all new lines (once).
      //  B) was already completed and still completed (edit) → apply delta old vs new.
      //  C) creating brand new with alsoReceive → add all lines (no prior state).
      // Update purchase_price on the products as a side-effect of receiving.
      const newStatus = alsoReceive ? "received" : status;
      const wasCompleted = prevStatusInDb === "received";
      const isNowCompleted = newStatus === "received";

      if (isNowCompleted && !wasCompleted) {
        // Case A or C — first time receiving
        await addStockForLines(valid);
        for (const it of valid) {
          if (!it.product_id) continue;
          await supabase.from("products").update({ purchase_price: it.unit_price }).eq("id", it.product_id);
        }
        if (alsoReceive) setStatus("received");
        toast.success("تم استلام البضاعة وتحديث المخزون");
      } else if (isNowCompleted && wasCompleted) {
        // Case B — edit of received order: apply delta
        await applyStockDeltaForPurchaseLines(prevItems, valid);
        for (const it of valid) {
          if (!it.product_id) continue;
          await supabase.from("products").update({ purchase_price: it.unit_price }).eq("id", it.product_id);
        }
        toast.success(isEdit ? "تم تحديث أمر الشراء والمخزون" : "تم الحفظ");
      } else {
        toast.success(isEdit ? "تم تحديث أمر الشراء" : "تم إنشاء أمر الشراء");
      }

      if (!isEdit && savedId) navigate(`/purchase/edit/${savedId}`, { replace: true });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handlePrint(variant: PrintVariant = "full", noHeader: boolean = false) {
    openPrintWindow(generatePrintHTML({
      type: "purchase",
      number: orderNumber,
      date: purchaseDate,
      customer: selectedSupplier ? { name: selectedSupplier.name, phone: selectedSupplier.phone, address: selectedSupplier.address } : null,
      items: rows.filter(r => r.product_id).map((it) => ({
        product_name: it.product_name, quantity: it.quantity, unit_price: it.unit_price,
        discount: it.discount, total: it.total, tax_amount: 0,
      })),
      subtotal: totals.subtotal, taxTotal: totals.taxTotal, discountTotal: totals.discountTotal, grandTotal: totals.grandTotal,
      notes, company: company as any,
      variant, noHeader,
    }));
  }

  return (
    <div ref={pageRef} className="neo-quote-scope" dir="rtl" style={{ position: "relative" }}>
      <style>{`
        .neo-quote-scope { background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: 12px; height: calc(100vh - 64px); overflow: hidden; container-type: inline-size; }
        .neo-quote-scope .panel { background: hsl(var(--card)); border-radius: 6px; padding: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.04); border: 1px solid hsl(var(--border)); }
        .neo-quote-scope .quick-add-row { background: hsl(var(--muted)); padding:2px 4px; border-radius:6px; border:1px solid hsl(var(--border)); margin-bottom: 6px; display: grid; grid-template-columns: 3fr 80px 110px 110px auto; gap: 4px; align-items: center; }
        .neo-quote-scope .quick-add-row .form-control,
        .neo-quote-scope .quick-add-row input,
        .neo-quote-scope .quick-add-row select { height: 28px !important; font-size: 12px !important; padding: 2px 8px !important; }
        .neo-quote-scope .product-search-container { position: relative; }
        .neo-quote-scope .search-suggestions { position:absolute; top:100%; left:0; right:0; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); border:1px solid hsl(var(--border)); border-radius:6px; max-height:220px; overflow-y:auto; z-index:50; box-shadow:0 4px 12px rgba(0,0,0,.12); }
        .neo-quote-scope .search-suggestions .item { padding:5px 8px; cursor:pointer; border-bottom:1px solid hsl(var(--border)); display:flex; justify-content:space-between; gap:6px; font-size:11px; font-weight:700; }
        .neo-quote-scope .search-suggestions .item:hover,
        .neo-quote-scope .search-suggestions .item[data-active="true"] { background: hsl(var(--primary) / 0.22); color: hsl(var(--primary)); font-weight: 900; box-shadow: inset 3px 0 0 hsl(var(--primary)); }
        .neo-quote-scope .customer-suggestions .customer-item[data-active="true"],
        .neo-quote-scope .customer-suggestions .customer-item:hover { background: hsl(var(--accent) / 0.18); }
        .neo-quote-scope .search-suggestions .price-badge { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; }
        /* Global styles for product suggestions portal (renders to document.body) */
        .search-suggestions { background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); border:1px solid hsl(var(--border)); border-radius:6px; max-height:220px; overflow-y:auto; box-shadow:0 4px 12px rgba(0,0,0,.12); font-size:12px; }
        .search-suggestions .item { padding:5px 8px; cursor:pointer; border-bottom:1px solid hsl(var(--border)); display:flex; justify-content:space-between; gap:6px; font-size:11px; font-weight:700; }
        .search-suggestions .item:hover,
        .search-suggestions .item[data-active="true"] { background: hsl(var(--accent) / 0.18); outline: 2px solid hsl(var(--primary) / 0.4); outline-offset: -2px; }
        .search-suggestions .price-badge { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; white-space:nowrap; }
        .neo-quote-scope .item_header { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
        .neo-quote-scope .item_header th { padding: 5px 4px; font-weight:600; font-size: 11px; text-align: center; }
        .neo-quote-scope .excel-table { width: 100%; border-collapse: collapse; }
        .neo-quote-scope .excel-row td { padding: 2px 3px; border-bottom: 1px solid hsl(var(--border)); font-size: 11px; }
        .neo-quote-scope .excel-row:nth-child(even) td { background: hsl(var(--muted) / 0.5); }
        .neo-quote-scope .form-control { width:100%; padding: 3px 6px; height: 26px; border:1px solid hsl(var(--input)); border-radius:4px; font-size:11px; background: hsl(var(--card)); color: hsl(var(--foreground)); }
        .neo-quote-scope .form-control:focus { outline: none; border-color: hsl(var(--ring)); box-shadow: 0 0 0 2px hsl(var(--ring) / 0.25); }
        .neo-quote-scope .text-center { text-align:center; }
        .neo-quote-scope .btn { padding: 4px 10px; border-radius:4px; border:none; cursor:pointer; font-size:11px; font-weight:500; height: 26px; transition: opacity .15s; }
        .neo-quote-scope .btn:hover { opacity: 0.9; }
        .neo-quote-scope .btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
        .neo-quote-scope .btn-success { background: hsl(var(--success)); color: hsl(var(--success-foreground)); }
        .neo-quote-scope .btn-danger { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
        .neo-quote-scope .btn-ghost { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .neo-quote-scope .btn-sm { padding: 2px 6px; font-size:10px; height: 22px; }
        .neo-quote-scope .summary-bar { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); padding:8px 12px; border-radius:6px; margin-top:8px; display:grid; grid-template-columns: repeat(5, 1fr); gap: 6px; align-items:center; }
        .neo-quote-scope .summary-bar .label { font-size:10px; opacity:.85; }
        .neo-quote-scope .summary-bar .value { font-size:14px; font-weight:700; }
        .neo-quote-scope .customer-suggestions { position:absolute; top:100%; left:0; right:0; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); border:2px solid hsl(var(--primary)); border-radius:6px; max-height:220px; overflow-y:auto; z-index:1000; box-shadow:0 8px 25px rgba(0,0,0,.15); margin-top:2px; }
        .neo-quote-scope .customer-item { padding:6px 8px; border-bottom:1px solid hsl(var(--border)); cursor:pointer; font-size:11px; }
        .neo-quote-scope .customer-item:hover { background: hsl(var(--accent) / 0.12); }
        .neo-quote-scope label { font-size:10px; color: hsl(var(--muted-foreground)); margin-bottom:2px; display:block; }
        .neo-quote-scope .header-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-end; background: hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:6px; padding:5px 8px; margin-bottom: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.04); overflow: visible; }
        .neo-quote-scope .header-bar .field { display:flex; flex-direction:column; position: relative; }
        .neo-quote-scope .header-bar .field label { font-size:10px; margin-bottom:1px; }
        .neo-quote-scope .header-bar .field .form-control { height:24px; font-size:11px; padding:2px 5px; }
        .neo-quote-scope .header-bar .customer-pill { font-size:10px; color: hsl(var(--foreground)); padding:1px 6px; background: hsl(var(--muted)); border-radius:3px; white-space:nowrap; }
        .neo-quote-scope .header-bar .field .form-control.customer-name-input { font-size: 14px; }
        @media (max-width: 1024px) { .neo-quote-scope .header-bar .field .form-control.customer-name-input { font-size: 13px; } }
        @media (max-width: 768px)  { .neo-quote-scope .header-bar .field .form-control.customer-name-input { font-size: 12px; } }
        @media (max-width: 480px)  { .neo-quote-scope .header-bar .field .form-control.customer-name-input { font-size: 11px; } }
        .neo-quote-scope .quote-layout { display: grid; grid-template-columns: minmax(0, 1fr) 14px minmax(180px, var(--sidebar-width, 260px)); grid-auto-flow: column; gap: 4px; align-items: stretch; height: 100%; }
        .neo-quote-scope .quote-layout > * { min-width: 0; min-height: 0; }
        .neo-quote-scope .form-column { display: flex; flex-direction: column; min-height: 0; height: 100%; }
        @media (max-width: 767px) {
          .neo-quote-scope { height: auto !important; min-height: calc(100vh - 64px); overflow: auto !important; }
          .neo-quote-scope .quote-layout { display: flex !important; flex-direction: column !important; height: auto !important; min-height: calc(100vh - 80px); }
          .neo-quote-scope .quote-layout > aside { width: 100% !important; max-width: 100% !important; min-height: 280px; }
          .neo-quote-scope .form-column { min-height: 70vh; height: auto; }
          .neo-quote-scope .items-table-wrap { height: 55vh !important; min-height: 360px !important; max-height: 60vh !important; flex: 0 0 auto !important; }
          .neo-quote-scope .items-scroll { height: 100% !important; min-height: 0 !important; max-height: none !important; }
        }
        .neo-quote-scope .items-scroll { flex: 1 1 auto; min-height: 320px; max-height: calc(100vh - 320px); }
        .neo-quote-scope .excel-table { table-layout: fixed; }
        .neo-quote-scope .items-scroll thead th { position: sticky; top: 0; z-index: 5; }
      `}</style>

      <div className="quote-layout" style={{ padding: 3, height: "100%" }}>
        <div className="form-column">
          {/* Header bar */}
          <div className="header-bar" style={{ flexShrink: 0, height: "auto" }}>
            <div className="field product-search-container has-suggestions" style={{ position: "relative", minWidth: 0, flex: `0 0 ${SUPPLIER_FIELD_BASE + (supExtras[0] || 0)}px` }}>
              <label>المورد</label>
              {!colsLocked && <ExpandFieldButton currentExtra={supExtras[0] || 0} onDrag={(v) => supSetExtra(0, v)} onReset={() => supReset(0)} title="اسحب لتغيير عرض حقل المورد · نقرة مزدوجة لإعادة الضبط" />}
              <input
                ref={supplierInputRef}
                type="text"
                className="form-control customer-name-input"
                placeholder="اسم المورد أو رقم الهاتف"
                value={supplierSearch}
                onChange={(e) => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true); if (selectedSupplier) { setSelectedSupplier(null); setSupplierId(""); } }}
                onFocus={() => setShowSupplierDropdown(true)}
                onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filteredSuppliers[0] && !selectedSupplier) selectSupplier(filteredSuppliers[0]);
                    else quickProductRef.current?.focus();
                  }
                }}
                style={{ fontWeight: 600, width: "100%" }}
              />
              {showSupplierDropdown && filteredSuppliers.length > 0 && (
                <div className="customer-suggestions">
                  {filteredSuppliers.map((s: any, i: number) => (
                    <div key={s.id} className="customer-item" data-sugg-item data-active={i === 0 ? "true" : "false"} onMouseDown={() => selectSupplier(s)}>
                      <strong>{s.name}</strong>
                      {s.phone && <span style={{ color: "hsl(var(--muted-foreground))", marginRight: 8 }}>{s.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new supplier button */}
            <div className="field" style={{ flex: "0 0 auto", width: 28 }}>
              <label>&nbsp;</label>
              <button
                type="button"
                onClick={() => setAddSupplierOpen(true)}
                className="form-control"
                title="إضافة مورد جديد"
                aria-label="إضافة مورد جديد"
                style={{
                  background: "#28a745", color: "#fff", border: "none", cursor: "pointer",
                  padding: 0, width: 28, minWidth: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 16, lineHeight: 1,
                }}
              >
                +
              </button>
            </div>


            <div className="field" style={{ width: HEADER_FIELD_BASES[0] + (hdrExtras[0] || 0) }}><label>التاريخ</label>
              <input type="date" className="form-control" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={{ width: "100%" }} />
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[0] || 0} onDrag={(v) => hdrSetExtra(0, v)} onReset={() => hdrReset(0)} />}
            </div>

            <div className="field" style={{ width: HEADER_FIELD_BASES[1] + (hdrExtras[1] || 0) }}><label>الاستلام المتوقع</label>
              <input type="date" className="form-control" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} style={{ width: "100%" }} />
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[1] || 0} onDrag={(v) => hdrSetExtra(1, v)} onReset={() => hdrReset(1)} />}
            </div>

            <div className="field" style={{ width: HEADER_FIELD_BASES[2] + (hdrExtras[2] || 0) }}><label>المستودع</label>
              <select className="form-control" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ minWidth: 0, width: "100%" }}>
                <option value="">كل المستودعات</option>
                {(warehouses || []).map((w: any) => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[2] || 0} onDrag={(v) => hdrSetExtra(2, v)} onReset={() => hdrReset(2)} />}
            </div>

            <div className="field" style={{ width: HEADER_FIELD_BASES[3] + (hdrExtras[3] || 0) }}><label># فاتورة المورد</label>
              <input type="text" className="form-control" value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} style={{ width: "100%" }} placeholder="اختياري" />
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[3] || 0} onDrag={(v) => hdrSetExtra(3, v)} onReset={() => hdrReset(3)} />}
            </div>

            {/* حقل label خامس: تفاصيل المورد — نفس ارتفاع باقي الحقول */}
            <div className="field" style={{ width: HEADER_FIELD_BASES[4] + (hdrExtras[4] || 0), minWidth: 80, flexShrink: 0 }}>
              <label>تفاصيل المورد</label>
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[4] || 0} onDrag={(v) => hdrSetExtra(4, v)} onReset={() => hdrReset(4)} />}
              <div className="form-control" style={{
                display: "flex", flexDirection: "row", alignItems: "center", flexWrap: "nowrap",
                overflow: "hidden", gap: 5,
                background: "hsl(var(--muted) / 0.5)", cursor: "default", userSelect: "text",
                height: 28, padding: "0 8px", fontSize: 11, whiteSpace: "nowrap",
              }}>
                {!selectedSupplier ? (
                  <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}>—</span>
                ) : (
                  <>
                    {selectedSupplier.phone && (
                      <span style={{ color: "hsl(var(--foreground))", fontWeight: 600, fontSize: 11, flexShrink: 0 }}>
                        📞 {selectedSupplier.phone}
                      </span>
                    )}
                    {Number(selectedSupplier.balance || 0) !== 0 && selectedSupplier.phone && (
                      <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 9, flexShrink: 0 }}>·</span>
                    )}
                    {Number(selectedSupplier.balance || 0) > 0 && (
                      <span style={{ color: "hsl(var(--destructive))", fontWeight: 700, fontSize: 11, flexShrink: 0, background: "hsl(var(--destructive)/0.08)", borderRadius: 3, padding: "0 3px" }}>
                        عليه {Number(selectedSupplier.balance).toLocaleString()}
                      </span>
                    )}
                    {Number(selectedSupplier.balance || 0) < 0 && (
                      <span style={{ color: "hsl(142 70% 35%)", fontWeight: 700, fontSize: 11, flexShrink: 0, background: "hsl(142 70% 35% / 0.08)", borderRadius: 3, padding: "0 3px" }}>
                        له {Math.abs(Number(selectedSupplier.balance)).toLocaleString()}
                      </span>
                    )}
                    {Number(selectedSupplier.balance || 0) === 0 && !selectedSupplier.phone && (
                      <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}>مسوّى</span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* رسالة العميل - مربع أيقونة فقط */}
            <div className="field" style={{ flex: "0 0 auto", width: 28, alignSelf: "flex-end" }}>
              <MessageImportButton onClick={() => setShowMessageImport(true)} />
            </div>

            {orderNumber && (
              <div className="customer-pill mx-0 py-[5px] font-light">رقم الأمر: <strong>{orderNumber}</strong></div>
            )}
          </div>
          

          {/* Quick-add row */}
          <div className="quick-add-row" style={{ flexShrink: 0, gridTemplateColumns: quickGrid(QUICK_BASE_PURCHASE) }}>
            <div className="product-search-container quick-add-field" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                onClick={() => setShowQuickAddProduct(true)}
                title="إضافة منتج جديد"
                aria-label="إضافة منتج جديد"
                style={{ flex: "0 0 auto", width: 28, height: 28, background: "#f97316", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 18, fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              >+</button>
              <input
                ref={quickProductRef}
                data-nav-col="product"
                type="text"
                className="form-control"
                placeholder="ابحث عن منتج..."
                data-quick-search="purchase"
                value={quickRow.productSearch}
                onChange={(e) => setQuickRow((r) => ({ ...r, productSearch: e.target.value, showSuggestions: true, product_id: null }))}
                onFocus={() => setQuickRow((r) => ({ ...r, showSuggestions: true }))}
                onBlur={() => setTimeout(() => setQuickRow((r) => ({ ...r, showSuggestions: false })), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const matches = productMatches(quickRow.productSearch);
                    if (matches[0]) pickProductIntoQuick(matches[0]);
                  }
                }}
              />
              <ExpandFieldButton currentExtra={quickExtras[0] || 0} onDrag={(v) => quickSetExtra(0, v)} onReset={() => quickReset(0)} />
              <SuggestionsPortal anchorSelector='[data-quick-search="purchase"]' open={quickRow.showSuggestions} width={suggWidth}>
                <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                  <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                  {productMatches(quickRow.productSearch).map((p, i) => (
                    <div key={p.id} className="item" data-sugg-item data-active={i === 0 ? "true" : "false"} onMouseDown={() => pickProductIntoQuick(p)}>
                      <span>{p.name}</span>
                      <span style={{ marginRight: 4, padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.12)", color: Number(p.stock_quantity) > 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)", border: `1px solid ${Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.35)" : "hsl(0 84% 60% / 0.3)"}`, flexShrink: 0 }}>
                        {Number(p.stock_quantity) > 0 ? Number(p.stock_quantity).toLocaleString() : "0"}
                      </span>
                    </div>
                  ))}
                </div>
              </SuggestionsPortal>
            </div>

            <div className="quick-add-field">
              <input
                ref={quickQtyRef}
                data-nav-col="quantity"
                type="number"
                className="form-control text-center"
                placeholder="كمية"
                value={quickRow.quantity || ""}
                onChange={(e) => setQuickRow((r) => recalcRow({ ...r, quantity: Number(e.target.value) || 0 }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickRowToTable(); } }}
              />
              <ExpandFieldButton currentExtra={quickExtras[1] || 0} onDrag={(v) => quickSetExtra(1, v)} onReset={() => quickReset(1)} />
            </div>
            <div className="quick-add-field">
              <input step="any"
                type="number"
                data-nav-col="unit_price"
                className="form-control text-center"
                placeholder="سعر محلي"
                value={quickRow.unit_price || ""}
                onChange={(e) => setQuickRow((r) => recalcRow({ ...r, unit_price: Number(e.target.value) || 0 }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickRowToTable(); } }}
              />
              <ExpandFieldButton currentExtra={quickExtras[2] || 0} onDrag={(v) => quickSetExtra(2, v)} onReset={() => quickReset(2)} />
            </div>
            <div className="quick-add-field">
              <input step="any"
                type="number"
                data-nav-col="foreign_price"
                className="form-control text-center"
                placeholder="سعر أجنبي"
                value={quickRow.foreign_price || ""}
                onChange={(e) => setQuickRow((r) => {
                  const fp = Number(e.target.value) || 0;
                  return recalcRow({ ...r, foreign_price: fp, unit_price: fp > 0 ? fp * defaultRate : r.unit_price });
                })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickRowToTable(); } }}
              />
              <ExpandFieldButton currentExtra={quickExtras[3] || 0} onDrag={(v) => quickSetExtra(3, v)} onReset={() => quickReset(3)} />
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={addQuickRowToTable}><Plus size={12} /> إضافة</button>
          </div>

          {rows.some((r) => r.selected) && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", background: "hsl(var(--accent) / 0.15)", border: "1px solid hsl(var(--border))", borderRadius: 6, marginBottom: 6, flexShrink: 0 }}>
              <span style={{ fontWeight: 600 }}>تم تحديد {rows.filter((r) => r.selected).length} بند</span>
              <button type="button" className="btn btn-danger btn-sm" onClick={deleteSelectedRows}>حذف المحدد</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleSelectAll(false)}>إلغاء التحديد</button>
            </div>
          )}

          {/* Items table */}
          <div className="items-table-wrap" style={{ background: "hsl(var(--card))", borderRadius: 8, overflow: "hidden", border: "1px solid hsl(var(--border))", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <ItemsScroll ref={itemsScrollRef} style={{ minHeight: 320, maxHeight: "calc(100vh - 320px)" }}>
              <table className="excel-table" style={{ width: "100%", tableLayout: "fixed" }} {...tableProps}>
                <colgroup>
                  {colWidths.map((w, i) => (
                    <col key={i} style={w != null ? { width: w } : (colMinWidths[i] != null ? { minWidth: colMinWidths[i]! } : undefined)} />
                  ))}
                </colgroup>
                <thead style={{ position: "sticky", top: 0, zIndex: 5, background: "hsl(var(--primary))" }}>
                  <tr className="item_header">
                    <th style={{ position: "relative" }}>
                      <input type="checkbox" checked={rows.length > 0 && rows.every((r) => r.selected)} onChange={(e) => toggleSelectAll(e.target.checked)} />
                      <ColumnResizeHandle onMouseDown={(e) => startColDrag(0, e)} hidden={colsLocked} />
                    </th>
                    <th style={{ position: "relative", padding: 0 }}>
                      {productHeaderSearch ? (
                        <input
                          autoFocus
                          type="text"
                          dir="auto"
                          placeholder="🔎 ابحث..."
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          onBlur={() => { if (!tableSearch.trim()) setProductHeaderSearch(false); }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setTableSearch("");
                              setProductHeaderSearch(false);
                            }
                          }}
                          style={{ width: "100%", height: 22, fontSize: 11, border: "none", background: "hsl(var(--background))", color: "hsl(var(--foreground))", padding: "0 6px", boxSizing: "border-box" }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setProductHeaderSearch(true)}
                          style={{ width: "100%", height: "100%", background: "transparent", border: "none", color: "inherit", font: "inherit", cursor: "pointer", padding: "4px 8px" }}
                          title="اضغط للبحث داخل المنتجات المضافة"
                        >
                          المنتج {tableSearch ? `(${tableSearch})` : ""}
                        </button>
                      )}
                      <ColumnResizeHandle onMouseDown={(e) => startColDrag(1, e)} hidden={colsLocked} />
                    </th>
                    <th style={{ position: "relative" }}>الكمية<ColumnResizeHandle onMouseDown={(e) => startColDrag(2, e)} hidden={colsLocked} /></th>
                    <th style={{ position: "relative" }}>السعر<ColumnResizeHandle onMouseDown={(e) => startColDrag(3, e)} hidden={colsLocked} /></th>
                    <th style={{ position: "relative" }}>السعر الأجنبي $<ColumnResizeHandle onMouseDown={(e) => startColDrag(4, e)} hidden={colsLocked} /></th>
                    <th style={{ position: "relative" }}>الإجمالي<ColumnResizeHandle onMouseDown={(e) => startColDrag(5, e)} hidden={colsLocked} /></th>
                    <th colSpan={2} style={{ position: "relative", padding: 0, height: 10, minWidth: 40 }}>
                      {!colsLocked ? (
                        <button
                          type="button"
                          title={COLS_BTN_SAVE_TITLE}
                          onClick={() => {
                            try { setColsLocked(true); toast.success(COLS_TOAST_SAVED); }
                            catch { toast.error(COLS_TOAST_SAVE_FAILED); }
                          }}
                          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", fontSize: 7, lineHeight: 1, padding: 0, margin: 0, border: "none", background: "hsl(var(--muted))", color: "hsl(var(--foreground))", cursor: "pointer", whiteSpace: "nowrap", boxSizing: "border-box", userSelect: "none" }}
                        >
                          {COLS_BTN_SAVE_LABEL}
                        </button>
                      ) : (
                        <button
                          type="button"
                          title={COLS_BTN_EDIT_TITLE}
                          onClick={() => { setColsLocked(false); toast(COLS_TOAST_EDIT_MODE); }}
                          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", fontSize: 7, lineHeight: 1, padding: 0, margin: 0, border: "none", background: "hsl(var(--muted))", color: "hsl(var(--foreground))", cursor: "pointer", whiteSpace: "nowrap", boxSizing: "border-box", userSelect: "none" }}
                        >
                          {COLS_BTN_EDIT_LABEL}
                        </button>
                      )}
                      <ColumnResizeHandle onMouseDown={(e) => startColDrag(6, e)} hidden={colsLocked} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const NAV_COLS = ["product", "quantity", "unit_price", "foreign_price", "total"];
                    const handleNav = makeRowNavHandler({
                      tableId: "purchase-items",
                      cols: NAV_COLS,
                      getRowCount: () => filteredRows.length,
                    });
                    return filteredRows.map((r, idx) => {
                    const matches = r.showSuggestions ? productMatches(r.productSearch, r.uid) : [];
                    return (
                      <tr key={r.uid} className={`excel-row ${r.selected ? "row-selected-danger" : ""} ${isSpacePending(r.uid) ? "row-pending-delete" : ""}`} onKeyDown={(e) => handleSpaceDelete(r.uid, e)}>
                        <td className="text-center">
                          <input type="checkbox" checked={r.selected} onChange={(e) => updateRow(r.uid, { selected: e.target.checked })} />
                        </td>
                        <td className="product-search-container">
                          <input
                            type="text"
                            className="form-control"
                            placeholder="ابحث عن منتج..."
                            data-row-search={r.uid}
                            data-nav-table="purchase-items"
                            data-nav-row={idx}
                            data-nav-col="product"
                            value={r.productSearch}
                            onChange={(e) => updateRow(r.uid, { productSearch: e.target.value, showSuggestions: true, product_id: null })}
                            
                            onBlur={() => setTimeout(() => updateRow(r.uid, { showSuggestions: false }), 150)}
                            onKeyDown={(e) => handleNav(idx, "product", e, { skipVertical: !!(r.showSuggestions && matches.length > 0) })}
                          />
                          <SuggestionsPortal anchorSelector={`[data-row-search="${r.uid}"]`} open={r.showSuggestions && matches.length > 0} width={suggWidth}>
                            <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                              <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                              {matches.map((p, i) => (
                                <div key={p.id} className="item" data-sugg-item data-active={i === 0 ? "true" : "false"} onMouseDown={() => pickProductIntoRow(r.uid, p)}>
                                  <span>{p.name}</span>
                                  <span style={{ marginRight: 4, padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.12)", color: Number(p.stock_quantity) > 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)", border: `1px solid ${Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.35)" : "hsl(0 84% 60% / 0.3)"}`, flexShrink: 0 }}>
                                    {Number(p.stock_quantity) > 0 ? Number(p.stock_quantity).toLocaleString() : "0"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </SuggestionsPortal>
                        </td>
                        <td><input type="number" className="form-control text-center" value={r.quantity || ""} data-nav-table="purchase-items" data-nav-row={idx} data-nav-col="quantity" onKeyDown={(e) => handleNav(idx, "quantity", e)} onChange={(e) => updateRow(r.uid, { quantity: Number(e.target.value) || 0 })} disabled={!r.product_id} /></td>
                        <td><input step="any" type="number" className="form-control text-center" value={r.unit_price || ""} data-nav-table="purchase-items" data-nav-row={idx} data-nav-col="unit_price" onKeyDown={(e) => handleNav(idx, "unit_price", e)} onChange={(e) => updateRow(r.uid, { unit_price: Number(e.target.value) || 0 })} disabled={!r.product_id} style={{ background: "#fff8e6" }} /></td>
                        <td><input step="any" type="number" className="form-control text-center" value={r.foreign_price || ""} data-nav-table="purchase-items" data-nav-row={idx} data-nav-col="foreign_price" onKeyDown={(e) => handleNav(idx, "foreign_price", e)} onChange={(e) => updateRow(r.uid, { foreign_price: Number(e.target.value) || 0 })} disabled={!r.product_id} /></td>
                        <td className="text-center" style={{ fontWeight: 700, color: "#28a745", outline: "none" }}
                            tabIndex={0}
                            data-nav-table="purchase-items" data-nav-row={idx} data-nav-col="total"
                            onKeyDown={(e) => handleNav(idx, "total", e)}>{r.product_id ? r.total.toLocaleString() : "—"}</td>
                        <td className="text-center" />
                        <td className="text-center">
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRow(r.uid)}>×</button>
                        </td>
                      </tr>
                    );
                    });
                  })()}
                </tbody>
              </table>
            </ItemsScroll>
          </div>

          {/* Footer bar — موحّد مع QuoteCreatePage/InvoiceCreatePage (summary + buttons قابلة للتخصيص) */}
          <ToolbarCustomizationProvider storageKey="purchase-create">
          <div dir="rtl" style={{ marginTop: 6, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <FreePositionToolbar
              screenKey="purchase-create-toolbar"
              withCustomizeButtons
              zoom={{ value: itemsZoom, inc: itemsZoomInc, dec: itemsZoomDec }}
              items={[
                {
                  id: "sum-total",
                  group: "0-summary",
                  useHandle: true,
                  defaultLabel: "المجموع",
                  node: (
                    <SummaryChip
                      screenKey="purchase-create-toolbar"
                      id="sum-total"
                      defaultLabel="المجموع"
                      value={totals.grandTotal.toLocaleString()}
                      valueStyle={{
                        display: "inline-block",
                        minWidth: 120,
                        height: 24,
                        padding: "2px 8px",
                        textAlign: "center",
                        border: "1px solid #16a34a",
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        background: "#dcfce7",
                        color: "#15803d",
                      }}
                    />
                  ),
                },
                // === Group 1: Primary actions ===
                {
                  id: "save",
                  group: "1-primary",
                  node: (
                    <button type="button" onClick={() => handleSubmit(false)} title={isEdit ? "تحديث" : "حفظ"} style={btnStyle("#2563eb")} disabled={saving}>
                      <Save size={14} /> {saving ? "جارٍ..." : (isEdit ? "تحديث" : "حفظ")}
                    </button>
                  ),
                },
                ...(status !== "received" ? [{
                  id: "save-and-receive",
                  group: "1-primary",
                  node: (
                    <button type="button" onClick={() => handleSubmit(true)} title="حفظ + استلام" style={btnStyle("#16a34a")} disabled={saving}>
                      ✓ حفظ + استلام
                    </button>
                  ),
                }] : []),
                ...(isEdit ? [{
                  id: "edit-save",
                  group: "1-primary",
                  node: (
                    <button type="button" onClick={() => handleSubmit(false)} title="حفظ التعديلات" style={btnStyle("#f97316")} disabled={saving}>
                      ✎ تعديل
                    </button>
                  ),
                }] : []),

                // === Group 2: Files & attachments ===
                {
                  id: "attachments",
                  group: "2-files",
                  node: (
                    <button type="button" onClick={() => setAttachOpen(true)} title="مرفقات" style={btnStyle("#a855f7")}>
                      <ImageIcon size={14} /> مرفقات
                    </button>
                  ),
                },
                {
                  id: "notes",
                  group: "2-files",
                  node: (
                    <button type="button" onClick={() => { setNotesDraft(notes); setNoteOpen(true); }} title={notes ? "تعديل الملاحظة" : "إضافة ملاحظة"} style={{ ...btnStyle(notes ? "#2563eb" : "#ffffff"), color: notes ? "#ffffff" : "#475569", border: notes ? "1px solid #2563eb" : "1px solid #cbd5e1" }}>
                      <StickyNote size={14} /> ملاحظة
                    </button>
                  ),
                },

                // === Group 3: Print & sharing ===
                ...(orderId ? [{
                  id: "print",
                  group: "3-share",
                  node: (
                    <button type="button" onClick={() => navigate(`/preview/purchase/${orderId}`)} style={btnStyle("#ef4444")} title="طباعة">
                      <Printer size={14} /> طباعة
                    </button>
                  ),
                }] : []),

                // === Group 4: Status & navigation ===
                {
                  id: "status",
                  group: "4-meta",
                  node: (
                    <StatusButton
                      statuses={PURCHASE_STATUS_OPTIONS}
                      current={status}
                      disabled={!isEdit}
                      disabledTitle="احفظ أمر الشراء أولاً"
                      onChange={async (v) => {
                        if (!editId) return;
                        const prev = status;
                        setStatus(v);
                        // If transitioning INTO "received" and DB still shows a non-completed status,
                        // read items from DB and add to stock (guarded by receiveStockForPurchaseOnce).
                        if (v === "received" && prev !== "received") {
                          try {
                            const { data: itemRows } = await supabase
                              .from("purchase_order_items")
                              .select("product_id, quantity, unit_price")
                              .eq("purchase_order_id", editId);
                            const lines = (itemRows || []).map((r: any) => ({
                              product_id: r.product_id, quantity: Number(r.quantity || 0),
                            }));
                            const res = await receiveStockForPurchaseOnce(editId, lines);
                            // also refresh purchase_price on receive
                            if (res.added) {
                              for (const r of (itemRows || [])) {
                                if (!r.product_id) continue;
                                await supabase.from("products").update({ purchase_price: r.unit_price }).eq("id", r.product_id);
                              }
                            }
                          } catch (err: any) {
                            setStatus(prev);
                            toast.error(`فشل تحديث المخزون: ${err.message || err}`);
                            return;
                          }
                        }
                        const { error } = await supabase.from("purchase_orders").update({ status: v }).eq("id", editId);
                        if (error) { setStatus(prev); toast.error(error.message); }
                        else if (v === "received" && prev !== "received") toast.success("تم تحديث الحالة وزيادة المخزون");
                        else if (prev === "received" && v !== "received") toast.message("تم تغيير الحالة. ملاحظة: لم يُعَد خصم المخزون تلقائياً.");
                        else toast.success("تم تحديث الحالة");
                      }}
                    />
                  ),
                },
                {
                  id: "new",
                  group: "4-meta",
                  node: (
                    <button type="button" onClick={() => { window.location.href = "/purchase/create"; }} title="جديد" style={btnStyle("#22c55e")}>
                      <Plus size={14} /> جديد
                    </button>
                  ),
                },
                {
                  id: "back",
                  group: "4-meta",
                  node: (
                    <button type="button" onClick={() => navigate("/purchase")} title="العودة" style={btnStyle("#9ca3af")}>
                      <ArrowRight size={14} /> العودة
                    </button>
                  ),
                },
                {
                  id: "cancel",
                  group: "4-meta",
                  node: (
                    <button type="button" onClick={() => navigate("/purchase")} title="إلغاء" style={btnStyle("#6b7280")}>
                      إلغاء
                    </button>
                  ),
                },
              ]}
            />
          </div>
          </ToolbarCustomizationProvider>
        </div>

        <PanelResizer storageKey="panels:purchase-create:sidebar" scopeSelector=".neo-quote-scope" />
        <aside className="recent-purchases-scope" style={{ alignSelf: "stretch", height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <RecentItemsSidebar type="purchases" compact />
          <RowResizer storageKey="rows:purchase-create:recent-density" scopeSelector=".recent-purchases-scope" cssVar="recent-density" mode="scale" defaultHeight={1.0} min={0.6} max={2.5} />
        </aside>
      </div>

      {/* Notes dialog */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>ملاحظة أمر الشراء</DialogTitle></DialogHeader>
          <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={6} placeholder="اكتب ملاحظتك هنا..." />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>إلغاء</Button>
            <Button onClick={() => { setNotes(notesDraft); setNoteOpen(false); toast.success("تم حفظ الملاحظة"); }}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachments */}
      {orderId && <PurchaseAttachmentsDialog open={attachOpen} onClose={() => setAttachOpen(false)} purchaseOrderId={orderId} />}
      {!orderId && attachOpen && (
        <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>المرفقات</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">احفظ أمر الشراء أولاً قبل إضافة المرفقات.</p>
            <DialogFooter><Button onClick={() => setAttachOpen(false)}>حسناً</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add supplier dialog */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة مورد جديد</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div>
              <label className="text-sm">الاسم *</label>
              <input className="w-full bg-muted rounded px-3 py-2 text-sm border border-border" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">الهاتف</label>
              <input className="w-full bg-muted rounded px-3 py-2 text-sm border border-border" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">العنوان</label>
              <input className="w-full bg-muted rounded px-3 py-2 text-sm border border-border" value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddSupplierOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreateSupplier} disabled={savingSupplier}>{savingSupplier ? "جارٍ..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickAddProductDialog
        open={showQuickAddProduct}
        onOpenChange={setShowQuickAddProduct}
        initialName={quickRow.productSearch}
        onCreated={(p: any) => {
          const exists = rows.some((r) => r.product_id === p.id);
          if (exists) {
            toast.error(`الصنف "${p.name}" مُضاف مسبقاً`);
            return;
          }
          const fp = Number(p.foreign_price || 0);
          const price = fp > 0 ? fp * defaultRate : Number(p.purchase_price || 0);
          const item = recalcRow({
            ...newRow(),
            uid: crypto.randomUUID(),
            product_id: p.id,
            product_name: p.name,
            productSearch: p.name,
            unit_price: price,
            foreign_price: fp,
            discount: 0,
            quantity: Number(p.stock_quantity) || 1,
          });
          setRows((prev) => [...prev.filter((r) => r.product_id), item]);
          setQuickRow(newRow());
          setTimeout(() => quickProductRef.current?.focus(), 0);
        }}
      />

      <MessageImportDialog
        open={showMessageImport}
        onClose={() => setShowMessageImport(false)}
        products={(products || []) as any[]}
        warehouseId={warehouseId}
        onImport={(lines: ParsedLine[]) => {
          setRows((prev) => {
            const next = [...prev.filter((r) => r.product_id)];
            for (const line of lines) {
              if (!line.matched) continue;
              const p = line.matched as any;
              const existingIdx = next.findIndex((r) => r.product_id === p.id);
              if (existingIdx >= 0) {
                const ex = { ...next[existingIdx] };
                ex.quantity = (Number(ex.quantity) || 0) + line.qty;
                next[existingIdx] = recalcRow(ex);
                continue;
              }
              const fp = Number(p.foreign_price || 0);
              const price = fp > 0 ? fp * defaultRate : Number(p.purchase_price || 0);
              const item = recalcRow({
                ...newRow(),
                uid: crypto.randomUUID(),
                product_id: p.id,
                product_name: p.name,
                productSearch: p.name,
                unit_price: price,
                foreign_price: fp,
                quantity: line.qty || 1,
              });
              next.push(item);
            }
            return next;
          });
          toast.success(`تم استيراد ${lines.filter((l) => l.matched).length} منتج من الرسالة`);
        }}
      />
    </div>
  );
}
