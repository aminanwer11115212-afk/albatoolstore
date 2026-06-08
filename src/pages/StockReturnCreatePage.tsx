import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllProducts } from "@/lib/fetchAllProducts";
import { toast } from "sonner";
import { applyStockDeltaForLines } from "@/utils/stockDeduction";
import { Plus, Edit, Printer, StickyNote } from "lucide-react";
import StatusButton, { STOCK_RETURN_STATUS_OPTIONS } from "@/components/StatusButton";
import RecentItemsSidebar from "@/components/RecentItemsSidebar";
import PanelResizer from "@/components/PanelResizer";
import RowResizer from "@/components/RowResizer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useScreenZoom } from "@/hooks/useScreenZoom";
import { useColumnWidths, useContainerFit, ColumnResizeHandle, useScreenColsLocked, screenColWidthsKey, migrateScreenColKeys, COLS_TOAST_SAVED, COLS_TOAST_SAVE_FAILED, COLS_TOAST_EDIT_MODE, COLS_BTN_SAVE_LABEL, COLS_BTN_EDIT_LABEL, COLS_BTN_SAVE_TITLE, COLS_BTN_EDIT_TITLE } from "@/hooks/useColumnWidths";
import { useSuggestionsWidth, SuggestionsResizeHandle } from "@/hooks/useSuggestionsWidth";
import { SuggestionsPortal } from "@/components/SuggestionsPortal";
import { makeRowNavHandler } from "@/utils/itemTableNav";
import { useCreatePageNav } from "@/utils/createPageNav";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";
import { useQuickRowWidths, ExpandFieldButton } from "@/hooks/useQuickRowWidths";
import { CustomerInfoStrip } from "@/utils/balanceDisplay";
import FreePositionToolbar from "@/components/toolbar/FreePositionToolbar";
import SummaryChip from "@/components/toolbar/SummaryChip";
import { ToolbarCustomizationProvider } from "@/components/toolbar/ToolbarCustomizationContext";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import { ItemsScroll } from "@/components/items/ItemsScroll";
import MessageImportDialog, { MessageImportButton } from "@/components/MessageImportDialog";
import type { ParsedLine } from "@/hooks/useMessageImport";

/** Keyboard navigation: Arrow keys + Enter between fields and within suggestion lists. */
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

      const isEmpty = (el: HTMLElement) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          const v = String(el.value ?? "").trim();
          return v === "" || v === "0";
        }
        return false;
      };

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

      let nextEl: HTMLElement | null = null;
      if (e.key === "Enter") {
        for (let i = idx + 1; i < focusables.length; i++) {
          if (isEmpty(focusables[i])) { nextEl = focusables[i]; break; }
        }
        if (!nextEl && idx + 1 < focusables.length) nextEl = focusables[idx + 1];
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (tag === "INPUT") {
          const t = (target as HTMLInputElement).type;
          if (t !== "number" && t !== "date" && t !== "checkbox") return;
        }
        nextEl = e.key === "ArrowLeft" ? focusables[idx + 1] || null : focusables[idx - 1] || null;
      } else {
        return;
      }

      if (nextEl) {
        e.preventDefault();
        nextEl.focus();
        if (nextEl instanceof HTMLInputElement && (nextEl.type === "text" || nextEl.type === "number")) {
          nextEl.select();
        }
      }
    };
    root.addEventListener("keydown", handler);
    return () => root.removeEventListener("keydown", handler);
  }, [rootRef]);
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  balance: number | null;
  company: string | null;
}

interface Product {
  id: string;
  name: string;
  sale_price: number | null;
  unit: string | null;
  stock_quantity: number | null;
  foreign_price?: number | null;
  is_frozen?: boolean | null;
  warehouse_id?: string | null;
}

interface InvoiceLite {
  id: string;
  invoice_number: string;
  date: string;
  total: number | null;
}

interface InvoiceItemLite {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit: string | null;
}

interface ReturnRow {
  uid: string;
  dbId?: string | null;
  product_id: string | null;
  product_name: string;
  productSearch: string;
  quantity: number;
  unit_price: number;
  total: number;
  unit: string | null;
  showSuggestions: boolean;
  selected: boolean;
  /** Original quantity in the linked invoice (for max-validation). */
  originalQty?: number | null;
}

const EMPTY_ROWS = 10;

function newRow(): ReturnRow {
  return {
    uid: crypto.randomUUID(),
    product_id: null,
    product_name: "",
    productSearch: "",
    quantity: 1,
    unit_price: 0,
    total: 0,
    unit: null,
    showSuggestions: false,
    selected: false,
    originalQty: null,
  };
}

function calcTotal(r: ReturnRow): number {
  return Math.round(r.quantity * r.unit_price * 100) / 100;
}

const btnStyle = (bg: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  background: bg, color: "#fff", border: "none",
  borderRadius: 4, padding: "6px 10px", fontSize: 12, fontWeight: 600,
  cursor: "pointer", height: 30, lineHeight: 1, whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
});

export default function StockReturnCreatePage() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  // One-time reset of saved toolbar positions for this screen
  useEffect(() => {
    const flag = "neobilling:toolbar-reset:stock-return-create:v3";
    if (localStorage.getItem(flag)) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("neobilling:toolbar-positions:v1:") && k.endsWith(":stock-return-create-toolbar")) {
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(flag, "1");
    window.location.reload();
  }, []);
  const { zoom: itemsZoom, inc: itemsZoomInc, dec: itemsZoomDec } = useScreenZoom("stock-return-create");
  // Unified item-table columns: [action, product(flex), qty, price, total, trailing]
  const colsScreenId = "stock-return-create";
  if (typeof window !== "undefined") migrateScreenColKeys(colsScreenId);
  const [colsLocked, setColsLocked] = useScreenColsLocked(colsScreenId);
  const { widths: colWidths, minWidths: colMinWidths, startDrag: startColDrag, tableProps, clampWidthsToContainer } = useColumnWidths(
    screenColWidthsKey(colsScreenId),
    [36, null, 80, 100, 100, 100, 36, 40],
    colsLocked,
  );
  const { width: suggWidth, startDrag: startSuggDrag } = useSuggestionsWidth("stock-return-create:suggWidth");
  const QUICK_BASE_RETURN = ["4fr", "90px", "1fr", "auto"];
  const { extras: quickExtras, setExtra: quickSetExtra, reset: quickReset, getGridTemplate: quickGrid } = useQuickRowWidths("stock-return-create:quickRowWidths", 3);
  const CUSTOMER_FIELD_BASE = 260;
  const { extras: custExtras, setExtra: custSetExtra, reset: custReset } = useQuickRowWidths("stock-return-create:customerFieldWidth", 1);
  // Header field widths (date, warehouse)
  const HEADER_FIELD_BASES = [140, 120, 130, 120];
  const { extras: hdrExtras, setExtra: hdrSetExtra, reset: hdrReset } = useQuickRowWidths("stock-return-create:headerFieldsWidth", 3);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companyCurrency, setCompanyCurrency] = useState<string>("SDG");
  const [returnPrefix, setReturnPrefix] = useState<string>("RET-");

  const [returnNumber, setReturnNumber] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const selectedCustomerIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedCustomerIdRef.current = customer?.id || null;
  }, [customer]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSugg, setShowCustomerSugg] = useState(false);
  const [reason, setReason] = useState("");
  const [returnStatus, setReturnStatus] = useState<string>("pending");
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  // Add customer dialog
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showMessageImport, setShowMessageImport] = useState(false);

  // Linked-invoice state
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceLite[]>([]);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string>("");
  const [linkedInvoiceItems, setLinkedInvoiceItems] = useState<InvoiceItemLite[]>([]);
  const [linkedInvoiceLoading, setLinkedInvoiceLoading] = useState(false);

  const [quickRow, setQuickRow] = useState<ReturnRow>(newRow());
  const [rows, setRows] = useState<ReturnRow[]>([]);
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

  const customerInputRef = useRef<HTMLInputElement>(null);
  const quickProductRef = useRef<HTMLInputElement>(null);
  const quickQtyRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useKeyboardNav(pageRef);
  useCreatePageNav({ rootRef: pageRef, customerRef: customerInputRef, itemsTableId: "return-items" });

  // ---------- Fetch initial data ----------
  useEffect(() => {
    (async () => {
      const [cs, ps, cfg, wh] = await Promise.all([
        supabase.from("customers").select("id,name,phone,balance,company").order("name"),
        fetchAllProducts<Product>("id,name,sale_price,foreign_price,unit,stock_quantity,is_frozen,warehouse_id"),
        supabase.from("company_settings").select("currency,return_prefix").maybeSingle(),
        supabase.from("warehouses").select("id,name").order("name"),
      ]);
      if (wh.data) setWarehouses(wh.data as any);
      if (cs.data) setCustomers(cs.data as Customer[]);
      setProducts((ps as any[]).filter((x:any)=>!x.is_frozen) as any);
      if (cfg.data) {
        setCompanyCurrency(cfg.data.currency || "SDG");
        setReturnPrefix((cfg.data as any).return_prefix || "RET-");
      }
      if (!editId) {
        const prefix = (cfg.data as any)?.return_prefix || "RET-";
        const { data: rs } = await supabase
          .from("stock_returns")
          .select("return_number")
          .like("return_number", `${prefix}%`);
        let maxN = 0;
        (rs || []).forEach((r: any) => {
          const after = String(r.return_number || "").slice(prefix.length);
          const mm = after.match(/^(\d+)/);
          const n = mm ? parseInt(mm[1]) : 0;
          if (n > maxN) maxN = n;
        });
        setReturnNumber(`${prefix}${String(maxN + 1).padStart(4, "0")}`);
      }
    })();

    // Refetch products when stock changes elsewhere (purchase receipt,
    // invoice creation/edit, product edits) or when the user returns to this tab.
    const refetchProducts = async () => {
      const ps = await fetchAllProducts<Product>("id,name,sale_price,foreign_price,unit,stock_quantity,is_frozen,warehouse_id");
      setProducts((ps as any[]).filter((x:any)=>!x.is_frozen) as any);
    };
    // Refetch customers when they change elsewhere or when user returns to this tab.
    const refetchCustomers = async () => {
      const { data } = await supabase.from("customers").select("id,name,phone,balance,company").order("name");
      if (data) {
        setCustomers(data as Customer[]);
        const currentId = selectedCustomerIdRef.current;
        if (currentId) {
          const matched = data.find((c: any) => c.id === currentId);
          if (matched) setCustomer(matched as Customer);
        }
      }
    };
    const handleFocus = () => {
      refetchProducts();
      refetchCustomers();
    };
    window.addEventListener("products:changed", refetchProducts);
    window.addEventListener("customers:changed", refetchCustomers);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("products:changed", refetchProducts);
      window.removeEventListener("customers:changed", refetchCustomers);
      window.removeEventListener("focus", handleFocus);
    };
  }, [editId]);

  // ---------- Load for edit ----------
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data: r } = await supabase.from("stock_returns").select("*").eq("id", editId).maybeSingle();
      if (!r) { toast.error("المرتجع غير موجود"); navigate("/stock-return"); return; }
      setReturnNumber(r.return_number);
      setReturnDate(r.date);
      setReason(r.reason || "");
      setReturnStatus(r.status || "pending");
      if (r.invoice_id) setLinkedInvoiceId(r.invoice_id);
      if (r.customer_id) {
        const { data: c } = await supabase.from("customers").select("id,name,phone,balance,company").eq("id", r.customer_id).maybeSingle();
        if (c) { setCustomer(c as Customer); setCustomerSearch((c as Customer).name); }
      }
      const { data: items } = await supabase.from("stock_return_items").select("*").eq("stock_return_id", editId);
      const loaded: ReturnRow[] = (items || []).map((it: any) => ({
        uid: crypto.randomUUID(),
        dbId: it.id,
        product_id: it.product_id,
        product_name: it.product_name,
        productSearch: it.product_name,
        quantity: Number(it.quantity) || 1,
        unit_price: Number(it.unit_price) || 0,
        total: Number(it.total) || 0,
        unit: null,
        showSuggestions: false,
        selected: false,
      }));
      setRows(loaded);
    })();
  }, [editId, navigate]);

  // ---------- Customer search ----------
  const customerMatches = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)).slice(0, 8);
  }, [customerSearch, customers]);

  function pickCustomer(c: Customer) {
    setCustomer(c);
    setCustomerSearch(c.name);
    setShowCustomerSugg(false);
    // reset linked invoice when customer changes
    setLinkedInvoiceId("");
    setLinkedInvoiceItems([]);
    setTimeout(() => quickProductRef.current?.focus(), 0);
  }

  function handleCustomerSaved(saved: any) {
    const created: Customer = {
      id: saved.id,
      name: saved.name,
      phone: saved.phone,
      balance: saved.balance,
      company: saved.company,
    } as Customer;
    setCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
    pickCustomer(created);
    setShowAddCustomer(false);
  }

  // ---------- Load latest invoices for selected customer ----------
  useEffect(() => {
    if (!customer?.id) { setCustomerInvoices([]); return; }
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,invoice_number,date,total")
        .eq("customer_id", customer.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      setCustomerInvoices((data || []) as InvoiceLite[]);
    })();
  }, [customer?.id]);

  // ---------- Load items of linked invoice ----------
  useEffect(() => {
    if (!linkedInvoiceId) { setLinkedInvoiceItems([]); return; }
    (async () => {
      setLinkedInvoiceLoading(true);
      const { data } = await supabase
        .from("invoice_items")
        .select("id,product_id,product_name,quantity,unit_price,unit")
        .eq("invoice_id", linkedInvoiceId);
      setLinkedInvoiceItems((data || []) as InvoiceItemLite[]);
      setLinkedInvoiceLoading(false);
    })();
  }, [linkedInvoiceId]);

  /** Suggestions: when an invoice is linked, restrict to its items; else show all products. */
  function productMatches(query: string, excludeRowUid?: string): Product[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const usedIds = new Set(
      rows.filter((r) => r.product_id && r.uid !== excludeRowUid).map((r) => r.product_id),
    );
    if (linkedInvoiceId && linkedInvoiceItems.length) {
      // map invoice items -> Product-like shape; dedupe by product_id+name
      const seen = new Set<string>();
      const list: Product[] = [];
      for (const it of linkedInvoiceItems) {
        const key = `${it.product_id || ""}|${it.product_name}`;
        if (seen.has(key)) continue;
        if (!it.product_name.toLowerCase().includes(q)) continue;
        const candidateId = it.product_id || it.id;
        if (usedIds.has(candidateId)) continue;
        seen.add(key);
        list.push({
          id: candidateId,
          name: it.product_name,
          sale_price: Number(it.unit_price) || 0,
          unit: it.unit,
          stock_quantity: null,
        });
        if (list.length >= 10) break;
      }
      return list;
    }
    return products
      .filter((p) => !usedIds.has(p.id))
      .filter((p) => !warehouseId || p.warehouse_id === warehouseId)
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 10);
  }

  function focusRowSearch(rowUid: string) {
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`input[data-row-search="${rowUid}"]`);
      el?.focus();
      el?.select();
    }, 50);
  }

  /** Find matching invoice item (by product_id first, then by name fallback). */
  function findInvoiceItem(productId: string | null, productName: string): InvoiceItemLite | null {
    if (!linkedInvoiceItems.length) return null;
    if (productId) {
      const byId = linkedInvoiceItems.find((it) => it.product_id === productId);
      if (byId) return byId;
    }
    return linkedInvoiceItems.find((it) => it.product_name === productName) || null;
  }

  function pickProductIntoRow(rowUid: string, p: Product) {
    const checkId = p.id;
    const exists = rows.some((r) => r.product_id === checkId && r.uid !== rowUid);
    if (exists) {
      toast.error(`الصنف "${p.name}" مُضاف مسبقاً`);
      setRows((prev) => prev.map((r) => (r.uid === rowUid ? { ...r, productSearch: "", showSuggestions: false } : r)));
      focusRowSearch(rowUid);
      return;
    }
    const invItem = findInvoiceItem(p.id, p.name);
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.uid !== rowUid) return r;
        const up = invItem ? Number(invItem.unit_price) || 0 : Number(p.sale_price) || 0;
        const qty = invItem ? Number(invItem.quantity) || 1 : r.quantity || 1;
        const merged: ReturnRow = {
          ...r,
          product_id: invItem?.product_id || p.id,
          product_name: p.name,
          productSearch: p.name,
          unit_price: up,
          quantity: qty,
          unit: invItem?.unit || p.unit,
          showSuggestions: false,
          originalQty: invItem ? Number(invItem.quantity) || 0 : null,
        };
        merged.total = calcTotal(merged);
        return merged;
      });
      return updated;
    });
  }

  function pickProductIntoQuick(p: Product) {
    const exists = rows.some((r) => r.product_id === p.id);
    if (exists) {
      toast.error(`الصنف "${p.name}" مُضاف مسبقاً`);
      setQuickRow((r) => ({ ...r, productSearch: "", showSuggestions: false }));
      setTimeout(() => quickProductRef.current?.focus(), 50);
      return;
    }
    const invItem = findInvoiceItem(p.id, p.name);
    setQuickRow((r) => {
      const up = invItem ? Number(invItem.unit_price) || 0 : Number(p.sale_price) || 0;
      const merged: ReturnRow = {
        ...r,
        product_id: invItem?.product_id || p.id,
        product_name: p.name,
        productSearch: p.name,
        unit_price: up,
        quantity: 0,
        unit: invItem?.unit || p.unit,
        showSuggestions: false,
        originalQty: invItem ? Number(invItem.quantity) || 0 : null,
      };
      merged.total = calcTotal(merged);
      return merged;
    });
    setTimeout(() => quickQtyRef.current?.focus(), 0);
  }

  function updateRow(uid: string, patch: Partial<ReturnRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const merged = { ...r, ...patch };
        merged.total = calcTotal(merged);
        return merged;
      }),
    );
  }

  async function removeRow(uid: string) {
    const target = rows.find((r) => r.uid === uid);
    if (!target) return;
    if (target.dbId && editId) {
      try {
        // إرجاع الكمية من المخزون (المرتجع كان قد أضافها سابقاً)
        if (target.product_id && Number(target.quantity) > 0) {
          await applyStockDeltaForLines(
            [],
            [{ product_id: target.product_id, quantity: Number(target.quantity) }],
          );
        }
        const { error } = await supabase.from("stock_return_items").delete().eq("id", target.dbId);
        if (error) throw error;
        toast.success("تم حذف البند وتعديل المخزون");
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
        const ex = { ...copy[existingIdx], quantity: (Number(copy[existingIdx].quantity) || 0) + addQty };
        ex.total = calcTotal(ex);
        copy[existingIdx] = ex;
        toast.info("تم زيادة الكمية للمنتج الموجود");
        return copy;
      }
      const newItem = { ...quickRow, uid: crypto.randomUUID(), quantity: addQty };
      newItem.total = calcTotal(newItem);
      return [...prev, newItem];
    });
    setQuickRow(newRow());
    setTimeout(() => quickProductRef.current?.focus(), 0);
  }

  const totals = useMemo(() => {
    const valid = rows.filter((r) => r.product_id);
    const total = valid.reduce((s, r) => s + r.quantity * r.unit_price, 0);
    return { count: valid.length, total: Math.round(total * 100) / 100 };
  }, [rows]);

  // ---------- Save ----------
  async function saveReturn() {
    if (!customer) { toast.error("اختر عميلاً"); return; }
    const valid = rows.filter((r) => r.product_id);
    if (!valid.length) { toast.error("أضف منتجاً واحداً على الأقل"); return; }

    // If linked to an invoice, validate that no row exceeds the invoice's original quantity
    if (linkedInvoiceId) {
      for (const r of valid) {
        if (r.originalQty != null && r.quantity > r.originalQty) {
          toast.error(`كمية "${r.product_name}" تتجاوز الكمية الأصلية في الفاتورة (${r.originalQty})`);
          return;
        }
      }
    }

    const payload: any = {
      return_number: returnNumber,
      customer_id: customer.id,
      invoice_id: linkedInvoiceId || null,
      date: returnDate,
      total: totals.total,
      reason,
      status: "pending",
    };

    // ── لقطة البنود القديمة قبل أي تعديل (لحساب فرق المخزون بدقة) ──
    let prevReturnItems: Array<{ product_id: string | null; quantity: number }> = [];
    if (editId) {
      const { data: snapshotItems } = await supabase
        .from("stock_return_items")
        .select("product_id, quantity")
        .eq("stock_return_id", editId);
      prevReturnItems = (snapshotItems || []).map((it: any) => ({
        product_id: it.product_id,
        quantity: Number(it.quantity || 0),
      }));
    }

    let rid = editId;
    if (editId) {
      const { error } = await supabase.from("stock_returns").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); return; }
      await supabase.from("stock_return_items").delete().eq("stock_return_id", editId);
    } else {
      let attempt = 0;
      let num = returnNumber;
      const prefix = returnPrefix || "RET-";
      while (attempt < 5) {
        const { data, error } = await supabase
          .from("stock_returns")
          .insert({ ...payload, return_number: num })
          .select("id")
          .single();
        if (!error) {
          rid = data.id;
          if (num !== returnNumber) {
            toast.message(`تم تعديل رقم المرتجع إلى ${num} لتفادي التكرار`);
          }
          setReturnNumber(num);
          break;
        }
        if (error.code === "23505" || /duplicate/i.test(error.message)) {
          const { data: rs } = await supabase.from("stock_returns").select("return_number").like("return_number", `${prefix}%`);
          let maxN = 0;
          (rs || []).forEach((r: any) => {
            const after = String(r.return_number || "").slice(prefix.length);
            const mm = after.match(/^(\d+)/);
            const n = mm ? parseInt(mm[1]) : 0;
            if (n > maxN) maxN = n;
          });
          num = `${prefix}${String(maxN + 1).padStart(4, "0")}`;
          attempt++;
          continue;
        }
        toast.error(error.message);
        return;
      }
      if (!rid) { toast.error("تعذّر توليد رقم مرتجع فريد"); return; }
    }

    const itemsPayload = valid.map((r) => ({
      stock_return_id: rid!,
      product_id: r.product_id,
      product_name: r.product_name,
      quantity: r.quantity,
      unit_price: r.unit_price,
      total: r.total,
    }));
    const { error: itemsErr } = await supabase.from("stock_return_items").insert(itemsPayload);
    if (itemsErr) { toast.error(itemsErr.message); return; }

    // ─── إعادة المخزون للمنتجات المرتجعة ───
    // applyStockDeltaForLines(oldLines, newLines) → delta = oldQty - newQty
    // لإعادة للمخزون: delta موجب → نجعل old=qty, new=0
    try {
      if (!editId) {
        // مرتجع جديد: old = الكميات المرتجعة، new = صفر
        await applyStockDeltaForLines(
          valid.map((r) => ({ product_id: r.product_id, quantity: r.quantity })),
          [],
        );
      } else {
        // تعديل: نستخدم اللقطة المحفوظة مسبقاً (prevReturnItems) لأن البنود القديمة
        // حُذفت واستُبدلت بالجديدة في DB قبل الوصول لهنا.
        const newStockLines = valid.map((r) => ({ product_id: r.product_id, quantity: r.quantity }));
        // عكس الاتجاه: applyStockDeltaForLines(new, old) → delta = new - old
        // (إذا زاد الإرجاع في التعديل → delta موجب → يُضاف للمخزون ✅)
        await applyStockDeltaForLines(newStockLines, prevReturnItems);
      }
    } catch (stockErr: any) {
      console.error("[StockReturn] stock restoration failed", stockErr);
      toast.warning("تم حفظ المرتجع لكن فشل تحديث المخزون: " + stockErr.message);
    }

    toast.success(editId ? "تم تحديث المرتجع وتعديل المخزون" : "تم حفظ المرتجع وإعادة الكميات للمخزون");
    navigate(`/stock-return/view/${rid}`);
  }

  // ---------- Render ----------
  return (
    <div ref={pageRef} className="neo-quote-scope" dir="rtl" style={{ position: "relative" }}>
      <style>{`
        .neo-quote-scope { background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: 12px; height: calc(100vh - 64px); overflow: hidden; container-type: inline-size; }
        .neo-quote-scope .quick-add-row { background: hsl(var(--muted)); padding:2px 4px; border-radius:6px; border:1px solid hsl(var(--border)); margin-bottom: 6px; display: grid; grid-template-columns: 4fr 90px 1fr auto; gap: 4px; align-items: center; }
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
        .neo-quote-scope .search-suggestions .price-badge { background: hsl(142 71% 45%); color: #fff; padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; }
        /* Global styles for product suggestions portal (renders to document.body) */
        .search-suggestions { background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); border:1px solid hsl(var(--border)); border-radius:6px; max-height:220px; overflow-y:auto; box-shadow:0 4px 12px rgba(0,0,0,.12); font-size:12px; }
        .search-suggestions .item { padding:5px 8px; cursor:pointer; border-bottom:1px solid hsl(var(--border)); display:flex; justify-content:space-between; gap:6px; font-size:11px; font-weight:700; }
        .search-suggestions .item:hover,
        .search-suggestions .item[data-active="true"] { background: hsl(var(--accent) / 0.18); outline: 2px solid hsl(var(--primary) / 0.4); outline-offset: -2px; }
        .search-suggestions .price-badge { background: hsl(142 71% 45%); color: #fff; padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; white-space:nowrap; }
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
        .neo-quote-scope .btn-success { background: hsl(142 71% 45%); color: #fff; }
        .neo-quote-scope .btn-danger { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
        .neo-quote-scope .btn-ghost { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .neo-quote-scope .btn-sm { padding: 2px 6px; font-size:10px; height: 22px; }
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
          {/* Unified header bar: customer + date + warehouse + reason */}
          <div className="header-bar" style={{ flexShrink: 0, height: "auto" }}>
            <div className="field product-search-container" style={{ position: "relative", minWidth: 0, flex: `0 0 ${CUSTOMER_FIELD_BASE + (custExtras[0] || 0)}px` }}>
              <label>العميل</label>
              {!colsLocked && <ExpandFieldButton currentExtra={custExtras[0] || 0} onDrag={(v) => custSetExtra(0, v)} onReset={() => custReset(0)} title="اسحب لتغيير عرض حقل العميل · نقرة مزدوجة لإعادة الضبط" />}
              <input
                ref={customerInputRef}
                type="text"
                className="form-control customer-name-input"
                placeholder="اسم العميل أو رقم الهاتف"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerSugg(true);
                  if (customer) setCustomer(null);
                }}
                onFocus={() => setShowCustomerSugg(true)}
                onBlur={() => setTimeout(() => setShowCustomerSugg(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (customerMatches[0] && !customer) pickCustomer(customerMatches[0]);
                    else quickProductRef.current?.focus();
                  }
                }}
                style={{ fontWeight: 600, width: "100%" }}
              />
              {showCustomerSugg && customerMatches.length > 0 && (
                <div className="customer-suggestions">
                  {customerMatches.map((c, i) => (
                    <div
                      key={c.id}
                      className="customer-item"
                      data-sugg-item
                      data-active={i === 0 ? "true" : "false"}
                      onMouseDown={() => pickCustomer(c)}
                    >
                      <strong>{c.name}</strong>
                      <span style={{ color: "hsl(var(--muted-foreground))", marginRight: 8 }}>{c.phone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new customer button */}
            <div className="field" style={{ flex: "0 0 auto", width: 28 }}>
              <label>&nbsp;</label>
              <button
                type="button"
                onClick={() => setShowAddCustomer(true)}
                className="form-control"
                title="إضافة عميل جديد"
                aria-label="إضافة عميل جديد"
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


            {customer && (
              <div className="field" style={{ minWidth: 200 }}>
                <label>
                  فاتورته {linkedInvoiceId && <span style={{ color: "hsl(142 71% 35%)", fontWeight: 700 }}>● مرتبط</span>}
                  {linkedInvoiceLoading && <span style={{ color: "hsl(var(--muted-foreground))" }}> جارٍ التحميل...</span>}
                </label>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <select
                    className="form-control"
                    value={linkedInvoiceId}
                    onChange={(e) => setLinkedInvoiceId(e.target.value)}
                    style={{ fontSize: 11, flex: 1, borderColor: linkedInvoiceId ? "hsl(142 71% 45%)" : undefined }}
                  >
                    <option value="">— بدون فاتورة (كل المنتجات) —</option>
                    {customerInvoices.map((inv) => {
                      const d = inv.date ? inv.date.split("-").reverse().join("/") : "";
                      return (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} — {d} — {Number(inv.total || 0).toLocaleString()}
                        </option>
                      );
                    })}
                  </select>
                  {linkedInvoiceId && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="إلغاء ربط الفاتورة"
                      onClick={() => setLinkedInvoiceId("")}
                      style={{ height: 24, padding: "0 6px" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="field" style={{ width: HEADER_FIELD_BASES[0] + (hdrExtras[0] || 0) }}>
              <label>التاريخ</label>
              <input type="date" className="form-control" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} style={{ width: "100%" }} />
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[0] || 0} onDrag={(v) => hdrSetExtra(0, v)} onReset={() => hdrReset(0)} />}
            </div>

            <div className="field" style={{ width: HEADER_FIELD_BASES[1] + (hdrExtras[1] || 0) }}>
              <label>المستودع</label>
              <select className="form-control" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ width: "100%", fontSize: 12 }}>
                <option value="">كل المستودعات</option>
                {warehouses.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[1] || 0} onDrag={(v) => hdrSetExtra(1, v)} onReset={() => hdrReset(1)} />}
            </div>

            {/* حقل label ثالث: تفاصيل العميل — نفس ارتفاع باقي الحقول */}
            <div className="field" style={{ width: HEADER_FIELD_BASES[2] + (hdrExtras[2] || 0), minWidth: 80, flexShrink: 0 }}>
              <label>تفاصيل العميل</label>
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[2] || 0} onDrag={(v) => hdrSetExtra(2, v)} onReset={() => hdrReset(2)} />}
              <div className="form-control" style={{
                display: "flex", flexDirection: "row", alignItems: "center", flexWrap: "nowrap",
                overflow: "hidden", gap: 5,
                background: "hsl(var(--muted) / 0.5)", cursor: "default", userSelect: "text",
                height: 28, padding: "0 8px", fontSize: 11, whiteSpace: "nowrap",
              }}>
                {!customer ? (
                  <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 10 }}>—</span>
                ) : (
                  <>
                    {customer.phone && (
                      <span style={{ color: "hsl(var(--foreground))", fontWeight: 600, fontSize: 11, flexShrink: 0 }}>
                        📞 {customer.phone}
                      </span>
                    )}
                    {Number(customer.balance || 0) !== 0 && customer.phone && (
                      <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 9, flexShrink: 0 }}>·</span>
                    )}
                    {Number(customer.balance || 0) > 0 && (
                      <span style={{ color: "hsl(var(--destructive))", fontWeight: 700, fontSize: 11, flexShrink: 0, background: "hsl(var(--destructive)/0.08)", borderRadius: 3, padding: "0 3px" }}>
                        عليه {Number(customer.balance).toLocaleString()}
                      </span>
                    )}
                    {Number(customer.balance || 0) < 0 && (
                      <span style={{ color: "hsl(142 70% 35%)", fontWeight: 700, fontSize: 11, flexShrink: 0, background: "hsl(142 70% 35% / 0.08)", borderRadius: 3, padding: "0 3px" }}>
                        له {Math.abs(Number(customer.balance)).toLocaleString()}
                      </span>
                    )}
                    {Number(customer.balance || 0) === 0 && !customer.phone && (
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
          </div>
          

          {/* Quick-add row */}
          <div className="quick-add-row" style={{ marginTop: 6, flexShrink: 0, gridTemplateColumns: quickGrid(QUICK_BASE_RETURN) }}>
            <div className="product-search-container quick-add-field">
              <input
                ref={quickProductRef}
                data-nav-col="product"
                type="text"
                className="form-control"
                placeholder={linkedInvoiceId ? "ابحث في منتجات الفاتورة المرتبطة..." : "ابحث عن منتج..."}
                data-quick-search="return"
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
              <SuggestionsPortal anchorSelector='[data-quick-search="return"]' open={quickRow.showSuggestions} width={suggWidth}>
                <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                  <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                  {productMatches(quickRow.productSearch).map((p, i) => (
                    <div
                      key={p.id}
                      className="item"
                      data-sugg-item
                      data-active={i === 0 ? "true" : "false"}
                      onMouseDown={() => pickProductIntoQuick(p)}
                    >
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
                placeholder="الكمية"
                value={quickRow.quantity || ""}
                onChange={(e) => setQuickRow((r) => {
                  const q = Number(e.target.value) || 0;
                  const merged = { ...r, quantity: q };
                  merged.total = calcTotal(merged);
                  return merged;
                })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickRowToTable(); } }}
              />
              <ExpandFieldButton currentExtra={quickExtras[1] || 0} onDrag={(v) => quickSetExtra(1, v)} onReset={() => quickReset(1)} />
            </div>

            <div className="quick-add-field">
              <input step="any"
                type="number"
                data-nav-col="unit_price"
                className="form-control text-center"
                placeholder="السعر"
                value={quickRow.unit_price || ""}
                onChange={(e) => setQuickRow((r) => {
                  const up = Number(e.target.value) || 0;
                  const merged = { ...r, unit_price: up };
                  merged.total = calcTotal(merged);
                  return merged;
                })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickRowToTable(); } }}
              />
              <ExpandFieldButton currentExtra={quickExtras[2] || 0} onDrag={(v) => quickSetExtra(2, v)} onReset={() => quickReset(2)} />
            </div>

            <button type="button" className="btn btn-primary btn-sm" onClick={addQuickRowToTable}>
              + إضافة
            </button>
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
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => r.selected)}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        title="تحديد الكل"
                      />
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
                    const visibleRows = rows.filter((r) => {
                      const q = tableSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (r.product_name || "").toLowerCase().includes(q) || (r.productSearch || "").toLowerCase().includes(q);
                    });
                    const NAV_COLS = ["product", "quantity", "unit_price", "foreign_price", "total"];
                    const handleNav = makeRowNavHandler({
                      tableId: "return-items",
                      cols: NAV_COLS,
                      getRowCount: () => visibleRows.length,
                    });
                    return visibleRows.map((r, idx, arr) => {
                    return (
                    <tr key={r.uid} className={`excel-row ${r.selected ? "row-selected-danger" : ""} ${isSpacePending(r.uid) ? "row-pending-delete" : ""}`} onKeyDown={(e) => handleSpaceDelete(r.uid, e)}>
                      <td className="text-center">
                        <input type="checkbox" checked={r.selected} onChange={(e) => updateRow(r.uid, { selected: e.target.checked })} />
                      </td>
                      <td>
                        <div className="product-search-container">
                          <input
                            type="text"
                            className="form-control"
                            placeholder="اكتب اسم المنتج..."
                            data-row-search={r.uid}
                            data-nav-table="return-items"
                            data-nav-row={idx}
                            data-nav-col="product"
                            value={r.productSearch}
                            onChange={(e) => updateRow(r.uid, { productSearch: e.target.value, showSuggestions: true, product_id: null })}
                            
                            onBlur={() => setTimeout(() => updateRow(r.uid, { showSuggestions: false }), 150)}
                            onKeyDown={(e) => handleNav(idx, "product", e, { skipVertical: !!r.showSuggestions })}
                          />
                          <SuggestionsPortal anchorSelector={`[data-row-search="${r.uid}"]`} open={r.showSuggestions} width={suggWidth}>
                            <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                              <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                              {r.showSuggestions && productMatches(r.productSearch, r.uid).map((p, i) => (
                                <div
                                  key={p.id}
                                  className="item"
                                  data-sugg-item
                                  data-active={i === 0 ? "true" : "false"}
                                  onMouseDown={() => pickProductIntoRow(r.uid, p)}
                                >
                                  <span>{p.name}</span>
                                  <span style={{ marginRight: 4, padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.12)", color: Number(p.stock_quantity) > 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)", border: `1px solid ${Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.35)" : "hsl(0 84% 60% / 0.3)"}`, flexShrink: 0 }}>
                                    {Number(p.stock_quantity) > 0 ? Number(p.stock_quantity).toLocaleString() : "0"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </SuggestionsPortal>
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-control text-center"
                          value={r.quantity}
                          data-nav-table="return-items" data-nav-row={idx} data-nav-col="quantity"
                          onKeyDown={(e) => handleNav(idx, "quantity", e)}
                          onChange={(e) => updateRow(r.uid, { quantity: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td>
                        <input step="any"
                          type="number"
                          className="form-control text-center"
                          value={r.unit_price || ""}
                          data-nav-table="return-items" data-nav-row={idx} data-nav-col="unit_price"
                          onKeyDown={(e) => handleNav(idx, "unit_price", e)}
                          onChange={(e) => updateRow(r.uid, { unit_price: Number(e.target.value) || 0 })}
                          style={{ background: "#fff8e6" }}
                        />
                      </td>
                      <td>
                        <input step="any"
                          type="number"
                          className="form-control text-center"
                          value={(r as any).foreign_price || ""}
                          data-nav-table="return-items" data-nav-row={idx} data-nav-col="foreign_price"
                          onKeyDown={(e) => handleNav(idx, "foreign_price", e)}
                          onChange={(e) => updateRow(r.uid, { foreign_price: Number(e.target.value) || 0 } as any)}
                        />
                      </td>
                      <td className="text-center" style={{ fontWeight: 700, color: "#28a745", outline: "none" }}
                          tabIndex={0}
                          data-nav-table="return-items" data-nav-row={idx} data-nav-col="total"
                          onKeyDown={(e) => handleNav(idx, "total", e)}>
                        {r.total.toLocaleString()}
                      </td>
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

          {/* Bottom action bar — موحّد مع InvoiceCreatePage/QuoteCreatePage (summary + buttons قابلة للتخصيص) */}
          <ToolbarCustomizationProvider storageKey="stock-return-create">
          <div dir="rtl" style={{ marginTop: 6, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <FreePositionToolbar
              screenKey="stock-return-create-toolbar"
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
                      screenKey="stock-return-create-toolbar"
                      id="sum-total"
                      defaultLabel="المجموع"
                      value={`${totals.total.toLocaleString()} ${companyCurrency}`}
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
                    <button className="btn btn-success btn-sm" onClick={saveReturn}>حفظ</button>
                  ),
                },
                ...(editId ? [{
                  id: "edit-save",
                  group: "1-primary",
                  node: (
                    <button onClick={saveReturn} title="حفظ التعديلات" style={btnStyle("#f97316")}>
                      <Edit size={14} /> تعديل
                    </button>
                  ),
                }] : []),

                // === Group 2: Files & attachments ===
                {
                  id: "notes",
                  group: "2-files",
                  node: (
                    <button
                      type="button"
                      onClick={() => { setNotesDraft(reason || ""); setNotesDialogOpen(true); }}
                      title={reason ? "تعديل السبب" : "إضافة سبب"}
                      style={{ ...btnStyle(reason ? "#2563eb" : "#ffffff"), color: reason ? "#ffffff" : "#475569", border: reason ? "1px solid #2563eb" : "1px solid #cbd5e1" }}
                    >
                      <StickyNote size={16} />
                    </button>
                  ),
                },

                // === Group 3: Print & sharing ===
                {
                  id: "print",
                  group: "3-share",
                  node: (
                    <button
                      onClick={() => editId && navigate(`/preview/return/${editId}`)}
                      title={editId ? "طباعة" : "احفظ المرتجع أولاً"}
                      style={btnStyle("#ef4444")}
                      disabled={!editId}
                    >
                      <Printer size={14} /> طباعة
                    </button>
                  ),
                },

                // === Group 4: Status & navigation ===
                {
                  id: "status",
                  group: "4-meta",
                  node: (
                    <StatusButton
                      statuses={STOCK_RETURN_STATUS_OPTIONS}
                      current={returnStatus}
                      disabled={!editId}
                      disabledTitle="احفظ المرتجع أولاً"
                      onChange={async (v) => {
                        if (!editId) return;
                        const prev = returnStatus;
                        setReturnStatus(v);
                        const { error } = await supabase.from("stock_returns").update({ status: v }).eq("id", editId);
                        if (error) { setReturnStatus(prev); toast.error(error.message); }
                        else toast.success("تم تحديث الحالة");
                      }}
                    />
                  ),
                },
                {
                  id: "new",
                  group: "4-meta",
                  node: (
                    <button onClick={() => setRows((prev) => [...prev, newRow()])} title="جديد" style={btnStyle("#22c55e")}>
                      <Plus size={14} /> جديد
                    </button>
                  ),
                },
                {
                  id: "cancel",
                  group: "4-meta",
                  node: (
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate("/stock-return")}>إلغاء</button>
                  ),
                },
              ]}
            />
          </div>
          </ToolbarCustomizationProvider>
        </div>

        <PanelResizer storageKey="panels:return-create:sidebar" scopeSelector=".neo-quote-scope" />
        <aside className="recent-returns-scope" style={{ alignSelf: "stretch", height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <RecentItemsSidebar type="returns" compact />
          <RowResizer storageKey="rows:return-create:recent-density" scopeSelector=".recent-returns-scope" cssVar="recent-density" mode="scale" defaultHeight={1.0} min={0.6} max={2.5} />
        </aside>
      </div>

      {/* Reason Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>سبب المرتجع</DialogTitle>
          </DialogHeader>
          <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="اكتب سبب المرتجع..." rows={6} className="resize-none" />
          <DialogFooter className="gap-2">
            {reason && (
              <Button variant="destructive" onClick={() => { setReason(""); setNotesDraft(""); setNotesDialogOpen(false); }}>حذف</Button>
            )}
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => { setReason(notesDraft); setNotesDialogOpen(false); }}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Add Customer Modal ============ */}
      <CustomerFormDialog
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        onSaved={handleCustomerSaved}
      />

      <MessageImportDialog
        open={showMessageImport}
        onClose={() => setShowMessageImport(false)}
        products={products}
        warehouseId={warehouseId}
        onImport={(lines: ParsedLine[]) => {
          setRows((prev) => {
            const next = [...prev.filter((r) => r.product_id)];
            for (const line of lines) {
              if (!line.matched) continue;
              const p = line.matched as any;
              const existingIdx = next.findIndex((r) => r.product_id === p.id);
              if (existingIdx >= 0) {
                const ex = { ...next[existingIdx], quantity: (Number(next[existingIdx].quantity) || 0) + line.qty };
                ex.total = calcTotal(ex);
                next[existingIdx] = ex;
                continue;
              }
              const item: ReturnRow = {
                ...newRow(),
                uid: crypto.randomUUID(),
                product_id: p.id,
                product_name: p.name,
                productSearch: p.name,
                unit_price: Number(p.sale_price) || 0,
                quantity: line.qty || 1,
                unit: p.unit || null,
                showSuggestions: false,
              };
              item.total = calcTotal(item);
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
