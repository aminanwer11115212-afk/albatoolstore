import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notifyDuplicateItem } from "@/utils/duplicateItemToast";
import { usePageRenderCount } from "@/hooks/usePageRenderCount";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllProducts } from "@/lib/fetchAllProducts";
import { startsWithAny } from "@/utils/searchMatch";
import { toast } from "sonner";
import { Plus, Edit, Printer, Image as ImageIcon, MessageCircle, FileText, StickyNote, Package, Truck } from "lucide-react";
import StatusButton, { QUOTE_STATUS_OPTIONS } from "@/components/StatusButton";
import RecentItemsSidebar from "@/components/RecentItemsSidebar";
import PanelResizer from "@/components/PanelResizer";
import RowResizer from "@/components/RowResizer";
import QuoteAttachmentsDialog from "@/components/quote/QuoteAttachmentsDialog";
import ItemNoteDialog from "@/components/invoice/ItemNoteDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { generateWhatsAppLink, openWhatsApp, pickCustomerWhatsApp} from "@/utils/whatsapp";
import { getLatestRate } from "@/utils/currency";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import { loadQuoteExtras } from "@/utils/printExtras";
import PrintMenu, { type PrintVariant } from "@/components/PrintMenu";
import { useQuoteConvertedDialog } from "@/hooks/useQuoteConvertedDialog";
import { useScreenZoom } from "@/hooks/useScreenZoom";
import { useColumnWidths, useContainerFit, ColumnResizeHandle, useScreenColsLocked, screenColWidthsKey, migrateScreenColKeys, COLS_TOAST_SAVED, COLS_TOAST_SAVE_FAILED, COLS_TOAST_EDIT_MODE, COLS_BTN_SAVE_LABEL, COLS_BTN_EDIT_LABEL, COLS_BTN_SAVE_TITLE, COLS_BTN_EDIT_TITLE } from "@/hooks/useColumnWidths";
import { useSuggestionsWidth, SuggestionsResizeHandle } from "@/hooks/useSuggestionsWidth";
import { SuggestionsPortal } from "@/components/SuggestionsPortal";
import { useQuickRowWidths, ExpandFieldButton } from "@/hooks/useQuickRowWidths";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { makeRowNavHandler } from "@/utils/itemTableNav";
import { useCreatePageNav } from "@/utils/createPageNav";
import { ItemsScroll } from "@/components/items/ItemsScroll";
import { TableFiller } from "@/components/items/TableFiller";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";
import { useUserRole } from "@/hooks/useUserRole";


import PackagingDialog from "@/components/packaging/PackagingDialog";
import QuickAddProductDialog from "@/components/product/QuickAddProductDialog";
import TransportDialog from "@/components/transport/TransportDialog";
import FreePositionToolbar from "@/components/toolbar/FreePositionToolbar";
import SummaryChip from "@/components/toolbar/SummaryChip";
import { ToolbarCustomizationProvider } from "@/components/toolbar/ToolbarCustomizationContext";
import { productMatches as sharedProductMatches } from "@/utils/productMatches";
import MessageImportDialog, { MessageImportButton } from "@/components/MessageImportDialog";
import type { ParsedLine } from "@/hooks/useMessageImport";
import ColumnsEditFloatingPanel from "@/components/ColumnsEditFloatingPanel";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import { CustomerInfoStrip } from "@/utils/balanceDisplay";

/**
 * تنقّل بالـ Arrow keys / Enter / Tab بين الحقول.
 * - عند وجود قائمة اقتراحات مفتوحة: Arrow Up/Down يتنقل داخل القائمة، Enter يختار.
 * - وإلا: Arrow Up/Down + Enter ينقل بين الحقول (لأقرب حقل فارغ مع Enter).
 */
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

      // ====== قائمة الاقتراحات مفتوحة؟ ======
      const container = target.closest(".product-search-container, .has-suggestions") as HTMLElement | null;
      // Suggestions may live inside the container (customers) or in a portal at body level (products).
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
            // mousedown لأن onMouseDown مستخدم للاختيار
            pick.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            return;
          }
        }
      }

      // ====== تنقّل عام بين الحقول ======
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

      let nextEl: HTMLElement | null = null;

      // Up/Down داخل شريط الإضافة السريع: تنقّل بدل تغيير قيمة input[type=number]
      const inQuickAdd = !!target.closest(".quick-add-row");
      if (inQuickAdd && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const col = target.getAttribute("data-nav-col");
        if (e.key === "ArrowDown") {
          let candidate: HTMLElement | null = null;
          const quickAddEl = target.closest(".quick-add-row") as HTMLElement | null;
          if (col !== "product" && quickAddEl) {
            candidate = quickAddEl.querySelector<HTMLElement>('[data-nav-col="product"]');
          }
          if (!candidate) {
            if (col) candidate = root.querySelector<HTMLElement>(`[data-nav-table][data-nav-col="${col}"]`);
            if (!candidate) candidate = root.querySelector<HTMLElement>("[data-nav-table]");
          }
          nextEl = candidate;
        } else {
          for (let i = idx - 1; i >= 0; i--) {
            if (!focusables[i].closest(".quick-add-row")) { nextEl = focusables[i]; break; }
          }
        }
        if (nextEl) {
          e.preventDefault();
          nextEl.focus();
          if (nextEl instanceof HTMLInputElement && (nextEl.type === "text" || nextEl.type === "number")) nextEl.select();
        } else {
          e.preventDefault();
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

      if (e.key === "Enter") {
        // Enter → أقرب حقل فارغ بعدنا، وإلا الذي يليه
        for (let i = idx + 1; i < focusables.length; i++) {
          if (isEmpty(focusables[i])) {
            nextEl = focusables[i];
            break;
          }
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

/**
 * QuoteCreatePage — مطابقة بنية NEOBILLING المرجعية (index.html) في React نقي.
 * - نفس الـ DOM والـ CSS classes من المرجع.
 * - نفس سلوك التنقل بـ Tab/Enter وdropdowns البحث.
 * - حساب unit_price = foreign_price × exchange_rate (لكل صف).
 * - مرتبطة بقاعدة بياناتك الحقيقية عبر Supabase.
 */

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
  foreign_price: number | null;
  unit: string | null;
  stock_quantity: number | null;
  category_id: string | null;
  warehouse_id?: string | null;
}

interface QuoteItem {
  uid: string; // داخلي للـ React keys
  dbId?: string | null; // معرّف الصف في قاعدة البيانات (إن كان محفوظاً)
  product_id: string | null;
  product_name: string;
  productSearch: string; // النص في حقل البحث
  quantity: number;
  foreign_price: number; // السعر الأجنبي من المنتج
  exchange_rate: number; // معدل التحويل (لكل صف)
  unit_price: number; // = foreign_price × exchange_rate
  discount: number; // %
  total: number;
  unit: string | null;
  showSuggestions: boolean;
  selected: boolean; // تحديد للحذف الجماعي
  note: string; // ملاحظة للمنتج (محلية)
}

function newRow(defaultRate = 1): QuoteItem {
  return {
    uid: crypto.randomUUID(),
    dbId: null,
    product_id: null,
    product_name: "",
    productSearch: "",
    quantity: 1,
    foreign_price: 0,
    exchange_rate: defaultRate,
    unit_price: 0,
    discount: 0,
    total: 0,
    unit: null,
    showSuggestions: false,
    selected: false,
    note: "",
  };
}

function calcTotal(r: QuoteItem): number {
  const sub = r.quantity * r.unit_price;
  const afterDisc = sub - sub * (r.discount / 100);
  return Math.round(afterDisc * 100) / 100;
}

const btnStyle = (bg: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
  background: bg, color: "#fff", border: "none",
  borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
  cursor: "pointer", height: 26, lineHeight: 1.1, whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
});

// بصمة مختصرة لبنود العرض/الفاتورة لاكتشاف ما إن تغيّرت قبل الحفظ
function quoteItemsHash(items: Array<{ product_id?: string | null; quantity?: any; unit_price?: any; foreign_price?: any; discount?: any; unit?: any; product_name?: any }>): string {
  return items
    .map((it) => [
      it.product_id || "",
      Number(it.quantity) || 0,
      Number(it.unit_price) || 0,
      Number(it.foreign_price) || 0,
      Number(it.discount) || 0,
      it.unit || "",
      it.product_name || "",
    ].join("|"))
    .join("§");
}

export default function QuoteCreatePage() {
  usePageRenderCount("/quotes/create");
  
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams();
  const [searchParams] = useSearchParams();
  const isSideMode = searchParams.get("side") === "1";
  const { showConverted, ConvertedDialog } = useQuoteConvertedDialog();
  const { zoom: itemsZoom, inc: itemsZoomInc, dec: itemsZoomDec } = useScreenZoom(isSideMode ? "side-quote-create" : "quote-create");
  const colsScreenId = isSideMode ? "side-quote-create" : "quote-create";
  // Unified item-table columns: [action, product(flex), qty, foreign$, price, total, dup, trailing]
  if (typeof window !== "undefined") migrateScreenColKeys(colsScreenId);
  const [colsLocked, setColsLocked] = useScreenColsLocked(colsScreenId);
  const { widths: colWidths, minWidths: colMinWidths, startDrag: startColDrag, reset: resetColWidths, saveAsUserDefault: saveColsAsDefault, tableProps, clampWidthsToContainer } = useColumnWidths(
    screenColWidthsKey(colsScreenId),
    [36, null, 80, 100, 100, 100, 36, 40],
    colsLocked,
  );
  const { width: suggWidth, startDrag: startSuggDrag } = useSuggestionsWidth("quote-create:suggWidth");
  const QUICK_BASE_QUOTE = ["4fr", "70px", "1fr", "1fr", "1fr", "auto"];
  const { extras: quickExtras, setExtra: quickSetExtra, reset: quickReset, getGridTemplate: quickGrid } = useQuickRowWidths("quote-create:quickRowWidths", 5);
  const CUSTOMER_FIELD_BASE = 260;
  const { extras: custExtras, setExtra: custSetExtra, reset: custReset } = useQuickRowWidths("quote-create:customerFieldWidth", 1);
  // Header field widths (date, warehouse)
  const HEADER_FIELD_BASES = [130, 140, 130, 120];
  const { extras: hdrExtras, setExtra: hdrSetExtra, reset: hdrReset } = useQuickRowWidths("quote-create:headerFieldsWidth", 3);
  // كل الستايل scoped داخل .neo-quote-scope في <style> أدناه.

  // ---------- Data state ----------
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [companyCurrency, setCompanyCurrency] = useState<string>("SDG");
  const [quotePrefix, setQuotePrefix] = useState<string>("QT-");
  const [sideQuotePrefix, setSideQuotePrefix] = useState<string>("QTS-");

  // header
  const [quoteNumber, setQuoteNumber] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const selectedCustomerIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedCustomerIdRef.current = customer?.id || null;
  }, [customer]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSugg, setShowCustomerSugg] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [customerGroups, setCustomerGroups] = useState<{ id: string; name: string }[]>([]);
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [itemNoteEditing, setItemNoteEditing] = useState<{ uid: string; productName?: string; value: string } | null>(null);
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const [quoteWorkflowStatus, setQuoteWorkflowStatus] = useState<string>("draft");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // قفل الحفظ لمنع النقرات المتكررة وإنشاء سجلات مكررة
  const savingQuoteRef = useRef(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const { isAdmin } = useUserRole();

  // Default exchange rate from Dashboard (latest in exchange_rates for foreign currency)
  const [defaultRate, setDefaultRate] = useState<number>(1);

  // Quick-add row (الصف العلوي الأخضر)
  const [quickRow, setQuickRow] = useState<QuoteItem>(newRow());

  // Items table rows
  const [rows, setRows] = useState<QuoteItem[]>([]);
  const itemsScrollRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef(false);
  const lastSavedIdRef = useRef<string | null>(null);
  // يُرفع بعد ضغط "+ جديد" لبدء جلسة إنشاء جديدة داخل نفس الشاشة،
  // فيتجاهل editId القادم من useParams (الذي لا يتغيّر مع replaceState).
  const newSessionRef = useRef(false);
  // العميل المحفوظ في آخر حفظ ناجح — لاكتشاف "تغيّر العميل ⇒ عرض سعر جديد"
  const lastSavedCustomerRef = useRef<string | null>(null);
  // بصمة البنود كما حُمِّلت من قاعدة البيانات؛ تُستخدم لتخطّي إعادة كتابة البنود إن لم تتغيّر
  const originalItemsHashRef = useRef<string | null>(null);
  // يُرفع عند حذف العرض من قاعدة البيانات أو تحويله إلى فاتورة أثناء الجلسة الحالية،
  // لإيقاف أي حفظ خلفي/autosave لاحق يعيد إنشاء العرض.
  const quoteGoneRef = useRef(false);
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
  // Restore scroll position after returning from packaging/transport
  useEffect(() => {
    if (!editId || rows.length === 0) return;
    const raw = sessionStorage.getItem(`quote-edit-scroll:${editId}`);
    if (!raw) return;
    try {
      const { page, items } = JSON.parse(raw);
      requestAnimationFrame(() => {
        window.scrollTo({ top: page || 0, behavior: 'auto' });
        if (itemsScrollRef.current) itemsScrollRef.current.scrollTop = items || 0;
      });
      sessionStorage.removeItem(`quote-edit-scroll:${editId}`);
    } catch {}
  }, [editId, rows.length === 0]);
  const [tableSearch, setTableSearch] = useState("");
  const [productHeaderSearch, setProductHeaderSearch] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [showMessageImport, setShowMessageImport] = useState(false);

  const customerInputRef = useRef<HTMLInputElement>(null);
  const quickProductRef = useRef<HTMLInputElement>(null);
  const quickQtyRef = useRef<HTMLInputElement>(null);
  const quickRateRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useKeyboardNav(pageRef);
  useCreatePageNav({ rootRef: pageRef, customerRef: customerInputRef, itemsTableId: "quote-items" });

  // ---------- Fetch initial data ----------
  useEffect(() => {
    (async () => {
      setProductsLoading(true);
      const [cs, ps, cfg, wh, gs] = await Promise.all([
        supabase.from("customers").select("id,name,phone,balance,company").order("name"),
        fetchAllProducts<Product>("id,name,sale_price,foreign_price,unit,stock_quantity,category_id,warehouse_id,is_frozen"),
        supabase.from("company_settings").select("currency,quote_prefix,side_quote_prefix").maybeSingle(),
        supabase.from("warehouses").select("id,name").order("name"),
        supabase.from("customer_groups").select("id,name").order("name"),
      ]);
      if (wh.data) setWarehouses(wh.data as any);
      if (gs.data) setCustomerGroups(gs.data as any);
      if (cs.data) setCustomers(cs.data as Customer[]);
      setProducts((ps as any[]).filter((x:any)=>!x.is_frozen) as any);
      setProductsLoading(false);
      if (cfg.data) {
        setCompanyCurrency(cfg.data.currency || "SDG");
        setQuotePrefix(cfg.data.quote_prefix || "QT-");
        setSideQuotePrefix((cfg.data as any).side_quote_prefix || "QTS-");
      }
      // رقم افتراضي عشوائي لكل عرض سعر جديد لتفادي التكرار
      // (العروض الجانبية لها بادئة وعدّاد مستقلان)
      if (!editId) {
        const prefix = isSideMode
          ? ((cfg.data as any)?.side_quote_prefix || "QTS-")
          : (cfg.data?.quote_prefix || "QT-");
        const { generateRandomDocNumber } = await import("@/utils/randomDocNumber");
        const candidate = await generateRandomDocNumber("quotes", "quote_number", prefix, {
          scope: (q) => (isSideMode ? q.eq("is_side", true) : q.or("is_side.is.null,is_side.eq.false")),
        });
        setQuoteNumber(candidate);
      }
    })();

    // Refetch products when stock/prices change elsewhere or when the user
    // returns to this tab, so the picker always shows the latest data.
    const refetchProducts = async () => {
      setProductsLoading(true);
      const ps = await fetchAllProducts<Product>("id,name,sale_price,foreign_price,unit,stock_quantity,category_id,warehouse_id,is_frozen");
      setProducts((ps as any[]).filter((x:any)=>!x.is_frozen) as any);
      setProductsLoading(false);
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

  // Fetch latest exchange rate from Dashboard (most recent entry in exchange_rates, any currency)
  useEffect(() => {
    (async () => {
      const { data: er } = await supabase
        .from("exchange_rates")
        .select("rate_to_base")
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rate = Number(er?.rate_to_base || 0);
      if (rate && rate > 0 && rate !== 1) {
        setDefaultRate(rate);
        setQuickRow((r) => (r.product_id ? r : { ...r, exchange_rate: rate, unit_price: r.foreign_price * rate }));
        setRows((prev) => prev.map((r) => (r.product_id ? r : { ...r, exchange_rate: rate, unit_price: r.foreign_price * rate })));
      }
    })();
  }, []);

  // ---------- Load quote for edit ----------
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data: q } = await supabase.from("quotes").select("*").eq("id", editId).maybeSingle();
      if (!q) {
        toast.error("عرض السعر غير موجود");
        navigate(isSideMode ? "/quotes/side" : "/quotes");
        return;
      }
      // Redirect to the correct edit URL if route doesn't match the quote's side flag
      const quoteIsSide = !!(q as any).is_side;
      if (quoteIsSide !== isSideMode) {
        navigate(quoteIsSide ? `/quotes/side/edit/${editId}` : `/quotes/edit/${editId}`, { replace: true });
        return;
      }
      setQuoteNumber(q.quote_number);
      setQuoteDate(q.date);
      setWarehouseId((q as any).warehouse_id || "");
      setGeneralDiscount(Number(q.discount) || 0);
      setNotes(q.notes || "");
      setInternalNote(q.internal_note || "");
      // Quote status: load actual value from `status` column
      setQuoteWorkflowStatus(String((q as any).status || "draft"));
      if (q.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select("id,name,phone,balance,company")
          .eq("id", q.customer_id)
          .maybeSingle();
        if (c) {
          setCustomer(c as Customer);
          setCustomerSearch((c as Customer).name);
        }
      }
      const { data: items } = await supabase.from("quote_items").select("*").eq("quote_id", editId);
      if (items?.length) {
        const mapped = items.map((it: any) => {
          const fp = Number(it.foreign_price) || 0;
          const up = Number(it.unit_price) || 0;
          const er = fp > 0 ? Math.round((up / fp) * 1000) / 1000 : 1;
          return {
            uid: crypto.randomUUID(),
            dbId: it.id,
            product_id: it.product_id,
            product_name: it.product_name,
            productSearch: it.product_name,
            quantity: Number(it.quantity) || 1,
            foreign_price: fp,
            exchange_rate: er,
            unit_price: up,
            discount: Number(it.discount) || 0,
            total: Number(it.total) || 0,
            unit: it.unit,
            showSuggestions: false,
            selected: false,
            note: "",
          };
        });
        setRows(mapped);
        // احفظ بصمة البنود الأصلية لتخطّي إعادة الكتابة لاحقاً إن لم تتغيّر
        originalItemsHashRef.current = quoteItemsHash(mapped);
      } else {
        originalItemsHashRef.current = "";
      }
    })();
  }, [editId, navigate]);

  // ---------- Customer search ----------
  const customerMatches = useMemo(() => {
    if (!customerSearch.trim()) return [];
    return customers.filter((c) => startsWithAny([c.name, c.phone], customerSearch)).slice(0, 8);
  }, [customerSearch, customers]);

  function pickCustomer(c: Customer) {
    setCustomer(c);
    setCustomerSearch(c.name);
    setShowCustomerSugg(false);
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
  function productMatches(query: string, _excludeRowUid?: string): Product[] {
    return sharedProductMatches(products, query, warehouseId) as Product[];
  }

  function focusRowSearch(rowUid: string) {
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`input[data-row-search="${rowUid}"]`);
      el?.focus();
      el?.select();
    }, 50);
  }

  function pickProductIntoRow(rowUid: string, p: Product) {
    const exists = rows.some((r) => r.product_id === p.id && r.uid !== rowUid);
    if (exists) {
      notifyDuplicateItem(p.name);
      setRows((prev) => prev.map((r) => (r.uid === rowUid ? { ...r, productSearch: "", showSuggestions: false } : r)));
      focusRowSearch(rowUid);
      return;
    }
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== rowUid) return r;
        const fp = Number(p.foreign_price) || Number(p.sale_price) || 0;
        const up = fp * r.exchange_rate;
        const updated: QuoteItem = {
          ...r,
          product_id: p.id,
          product_name: p.name,
          productSearch: p.name,
          foreign_price: fp,
          unit_price: up,
          unit: p.unit,
          showSuggestions: false,
        };
        updated.total = calcTotal(updated);
        return updated;
      }),
    );
  }

  function pickProductIntoQuick(p: Product) {
    const exists = rows.some((r) => r.product_id === p.id);
    if (exists) {
      notifyDuplicateItem(p.name);
      setQuickRow((r) => ({ ...r, productSearch: "", showSuggestions: false }));
      setTimeout(() => quickProductRef.current?.focus(), 50);
      return;
    }
    setQuickRow((r) => {
      const fp = Number(p.foreign_price) || Number(p.sale_price) || 0;
      const up = fp * r.exchange_rate;
      const updated: QuoteItem = {
        ...r,
        product_id: p.id,
        product_name: p.name,
        productSearch: p.name,
        foreign_price: fp,
        unit_price: up,
        quantity: 0,
        unit: p.unit,
        showSuggestions: false,
      };
      updated.total = calcTotal(updated);
      return updated;
    });
    setTimeout(() => quickQtyRef.current?.focus(), 0);
  }

  // ---------- Update row fields ----------
  function updateRow(uid: string, patch: Partial<QuoteItem>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const merged = { ...r, ...patch };
        // recompute unit_price إذا تغيّر foreign_price أو exchange_rate
        if ("foreign_price" in patch || "exchange_rate" in patch) {
          merged.unit_price = merged.foreign_price * merged.exchange_rate;
        }
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
        const { error } = await supabase.from("quote_items").delete().eq("id", target.dbId);
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

  function addQuickRowToTable() {
    if (!quickRow.product_id) {
      toast.error("اختر منتجاً أولاً");
      quickProductRef.current?.focus();
      return;
    }
    const addQty = Number(quickRow.quantity) || 1;
    setRows((prev) => {
      const filtered = prev.filter((r) => r.product_id);
      const existingIdx = filtered.findIndex((r) => r.product_id === quickRow.product_id);
      if (existingIdx >= 0) {
        const copy = [...filtered];
        const ex = { ...copy[existingIdx] };
        ex.quantity = (Number(ex.quantity) || 0) + addQty;
        ex.total = calcTotal(ex);
        copy[existingIdx] = ex;
        toast.info("تم زيادة الكمية للمنتج الموجود");
        return copy;
      }
      const newItem = { ...quickRow, uid: crypto.randomUUID(), quantity: addQty };
      newItem.total = calcTotal(newItem);
      return [...filtered, newItem];
    });
    setQuickRow(newRow(defaultRate));
    setTimeout(() => quickProductRef.current?.focus(), 0);
  }

  // ---------- Totals ----------
  const totals = useMemo(() => {
    const validRows = rows.filter((r) => r.product_id);
    const subtotal = validRows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
    const itemDiscounts = validRows.reduce((s, r) => s + r.quantity * r.unit_price * (r.discount / 100), 0);
    const taxableBase = subtotal - itemDiscounts;
    const afterGeneral = taxableBase - generalDiscount;
    const total = afterGeneral;
    return { subtotal, itemDiscounts, taxAmount: 0, total: Math.round(total * 100) / 100 };
  }, [rows, generalDiscount]);

  // ---------- Print ----------
  async function handlePrint(variant: PrintVariant = "full", noHeader: boolean = false) {
    // إذا كان عرض السعر محفوظاً → ننتقل للمعاينة الداخلية (نفس النافذة).
    if (editId) {
      const qs = new URLSearchParams();
      if (variant !== "full") qs.set("variant", variant);
      if (noHeader) qs.set("noHeader", "1");
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      navigate(`/preview/quote/${editId}${suffix}`);
      const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
      await markQuoteAsSent(editId);
      return;
    }
    // غير محفوظ بعد → نُبقي النافذة المنبثقة بنفس البيانات الحالية في الذاكرة.
    const { data: companyArr } = await supabase.from("company_settings").select("*").limit(1);
    const company = companyArr?.[0] || null;
    openPrintWindow(generatePrintHTML({
      type: "quote",
      number: quoteNumber,
      date: quoteDate,
      customer: customer ? { name: customer.name, phone: customer.phone || "", company: customer.company || "" } : null,
      items: rows.filter((r: any) => r.product_id).map((r: any) => ({
        product_name: r.product_name,
        quantity: r.quantity,
        unit_price: r.unit_price,
        tax_amount: 0,
        discount: r.discount,
        total: r.total,
      })),
      subtotal: totals.subtotal,
      taxTotal: totals.taxAmount,
      discountTotal: totals.itemDiscounts + generalDiscount,
      grandTotal: totals.total,
      notes,
      company: company as any,
      oldBalance: Number(customer?.balance || 0),
      variant,
      noHeader,
    }));
  }

  // ---------- Save ----------
  async function saveQuote(asStatus: "draft" | "sent" = "draft", opts: { andNew?: boolean; skipNavigate?: boolean; silent?: boolean } = {}): Promise<boolean> {
    // لا تحفظ إذا كان العرض قد حُذف/حُوِّل في الجلسة الحالية
    if (quoteGoneRef.current) return false;
    // منع النقرات المتكررة أثناء حفظ سابق غير مكتمل
    if (savingQuoteRef.current) return false;
    savingQuoteRef.current = true;
    setSavingQuote(true);
    try {
    let activeCustomer = customer;
    // إن لم يُختَر عميل من القائمة لكن يوجد اسم نصي حر، أنشئ عميلاً جديداً تلقائياً
    if (!activeCustomer) {
      const freeName = (customerSearch || "").trim();
      if (!freeName) {
        toast.error("اختر عميلاً أو اكتب اسمه");
        return false;
      }
      // ابحث أولاً عن عميل موجود (مع تطبيع الاسم) لتفادي التكرار
      const { findExistingCustomerByName } = await import("@/utils/customerMatch");
      const existing = await findExistingCustomerByName(freeName);
      if (existing) {
        activeCustomer = existing as any;
        toast.message(`تم استخدام العميل الموجود: ${existing.name}`);
      } else {
        const { data: { user: _cu } } = await supabase.auth.getUser();
        const { data: created, error: cErr } = await supabase
          .from("customers")
          .insert({ name: freeName, created_by_uid: _cu?.id || null })
          .select("*")
          .single();
        if (cErr) {
          toast.error(`تعذّر إنشاء العميل: ${cErr.message}`);
          return false;
        }
        activeCustomer = created as any;
        toast.message(`تم إنشاء عميل جديد: ${freeName}`);
      }
      // مزامنة الواجهة: الكائن، النص، وقائمة الاقتراحات
      setCustomer(activeCustomer as any);
      setCustomerSearch((activeCustomer as any).name || (customerSearch || "").trim());
      setCustomers((prev) =>
        prev.some((p) => p.id === (activeCustomer as any).id)
          ? prev
          : [activeCustomer as any, ...prev]
      );
    }
    const validRows = rows.filter((r) => r.product_id);
    if (!validRows.length) {
      toast.error("أضف منتجاً واحداً على الأقل");
      return false;
    }

    const payload = {
      quote_number: quoteNumber,
      customer_id: activeCustomer!.id,
      date: quoteDate,
      warehouse_id: warehouseId || null,
      subtotal: totals.subtotal,
      discount: generalDiscount,
      
      total: totals.total,
      notes,
      internal_note: internalNote,
      status: (editId || lastSavedIdRef.current) ? (quoteWorkflowStatus || asStatus) : asStatus,
      currency_code: companyCurrency,
    };

    // المعرّف الفعّال للتعديل: من URL، أو من آخر حفظ ناجح في نفس الجلسة
    // (window.history.replaceState لا يُحدِّث useParams، لذلك بدون هذا
    // الاحتياط ستُنشئ نقرة الحفظ الثانية عرض سعر جديداً مكرَّراً).
    // إذا تغيّر العميل عمّا حُفظ → عرض جديد برقم عشوائي جديد.
    let effectiveEditId = (newSessionRef.current ? undefined : editId) || lastSavedIdRef.current || undefined;
    if (effectiveEditId && !editId && lastSavedCustomerRef.current && lastSavedCustomerRef.current !== activeCustomer!.id) {
      lastSavedIdRef.current = null;
      effectiveEditId = undefined;
      const _prefix = isSideMode ? (sideQuotePrefix || "QTS-") : (quotePrefix || "QT-");
      const { generateRandomDocNumber } = await import("@/utils/randomDocNumber");
      const _newNum = await generateRandomDocNumber("quotes", "quote_number", _prefix, {
        scope: (q) => (isSideMode ? q.eq("is_side", true) : q.or("is_side.is.null,is_side.eq.false")),
      });
      setQuoteNumber(_newNum);
      payload.quote_number = _newNum;
    }
    let qid: string | undefined = effectiveEditId;
    // إن كنا في وضع التعديل، احسب البصمة الحالية وقارنها بالأصلية لتقرير ما إذا كنا سنعيد كتابة البنود
    const currentItemsHash = quoteItemsHash(validRows);
    const itemsUnchanged = !!effectiveEditId && originalItemsHashRef.current !== null && originalItemsHashRef.current === currentItemsHash;
    let recordExisted = true;

    if (effectiveEditId) {
      // UPDATE مباشر بدون SELECT وقائي مسبق؛ نتحقق من العدد المُعاد لمعرفة إن كان السجل موجوداً
      const { data: updated, error } = await supabase
        .from("quotes")
        .update(payload)
        .eq("id", effectiveEditId)
        .select("id");
      if (error) {
        toast.error(error.message);
        return false;
      }
      if (!updated || updated.length === 0) {
        // السجل محذوف من قاعدة البيانات (محوّل أو ممسوح) — أنشئ عرضاً جديداً بدل الفشل في FK
        toast.message("عرض السعر السابق غير موجود في قاعدة البيانات — سيتم إنشاء عرض جديد");
        qid = undefined;
        recordExisted = false;
        lastSavedIdRef.current = null;
      } else if (!itemsUnchanged) {
        // البنود تغيّرت — احذفها لإعادة إدراجها لاحقاً
        await (supabase as any).rpc("delete_quote_items_silent", { p_quote_id: effectiveEditId });
      }
    }

    if (!qid) {
      // attach creator for RLS / staff filtering
      const { data: { user: _u } } = await supabase.auth.getUser();
      (payload as any).created_by_uid = _u?.id || null;
      (payload as any).is_side = isSideMode;
      // Try insert; on duplicate quote_number, recompute next number and retry up to 5 times
      let attempt = 0;
      let qNum = quoteNumber;
      const prefix = isSideMode ? (sideQuotePrefix || "QTS-") : (quotePrefix || "QT-");
      while (attempt < 5) {
        const { data, error } = await supabase
          .from("quotes")
          .insert({ ...payload, quote_number: qNum })
          .select("id")
          .single();
        if (!error) {
          qid = data.id;
          if (qNum !== quoteNumber) {
            toast.message(`تم تعديل رقم العرض إلى ${qNum} لتفادي التكرار`);
          }
          setQuoteNumber(qNum);
          break;
        }
        if (error.code === "23505" || /duplicate key|quotes_quote_number_key/i.test(error.message)) {
          // ولّد رقماً عشوائياً جديداً وحاول مجدداً
          const { generateRandomDocNumber } = await import("@/utils/randomDocNumber");
          qNum = await generateRandomDocNumber("quotes", "quote_number", prefix, {
            scope: (q) => (isSideMode ? q.eq("is_side", true) : q.or("is_side.is.null,is_side.eq.false")),
            digits: 5 + Math.min(attempt, 2),
          });
          attempt++;
          continue;
        }
        toast.error(error.message);
        return false;
      }
      if (!qid) {
        toast.error("تعذّر توليد رقم عرض سعر فريد، حاول مرة أخرى");
        return false;
      }
    }

    // إعادة كتابة البنود فقط إن تغيّرت أو كنا أنشأنا سجلاً جديداً
    if (!recordExisted || !itemsUnchanged) {
      const itemsPayload = validRows.map((r) => ({
        quote_id: qid!,
        product_id: r.product_id,
        product_name: r.product_name,
        quantity: r.quantity,
        unit_price: r.unit_price,
        foreign_price: r.foreign_price,
        discount: r.discount,
        total: r.total,
        unit: r.unit,
      }));
      const { error: itemsErr } = await supabase.from("quote_items").insert(itemsPayload);
      if (itemsErr) {
        toast.error(itemsErr.message);
        return false;
      }
      // حدِّث البصمة المرجعية لتعكس آخر حفظ ناجح
      originalItemsHashRef.current = currentItemsHash;
    }


    if (!opts.silent) toast.success(effectiveEditId && recordExisted ? "تم تحديث عرض السعر" : "تم حفظ عرض السعر");
    savedRef.current = true;
    lastSavedIdRef.current = qid!;
    lastSavedCustomerRef.current = activeCustomer!.id;
    // إذا كنّا في وضع الإنشاء وتم الحفظ بنجاح، بدّل العنوان لوضع التعديل
    // حتى لا يُنشئ الضغط على "حفظ" مجدداً عرض سعر جديد
    if (!editId && qid) {
      const editPath = isSideMode ? `/quotes/side/edit/${qid}` : `/quotes/edit/${qid}`;
      window.history.replaceState({}, "", editPath);
    }
    if (opts.skipNavigate) {
      return true;
    }
    if (opts.andNew) {
      newSessionRef.current = true;
      // إعادة التعيين في نفس الشاشة — لا تنقل المستخدم لصفحة أخرى
      setRows([]);
      setCustomer(null);
      setCustomerSearch("");
      setNotes("");
      setInternalNote("");
      setGeneralDiscount(0);
      setQuoteDate(new Date().toISOString().slice(0, 10));
      setQuoteNumber("");
      savedRef.current = false;
      lastSavedIdRef.current = null;
      lastSavedCustomerRef.current = null;
      originalItemsHashRef.current = null;
      const createPath = isSideMode ? "/quotes/side/new" : "/quotes/new";
      window.history.replaceState({}, "", createPath);
      setTimeout(() => customerInputRef.current?.focus(), 0);
    }
    return true;
    } finally {
      savingQuoteRef.current = false;
      setSavingQuote(false);
    }
  }


  // Re-arm the guard whenever inputs change after a save
  useEffect(() => {
    savedRef.current = false;
  }, [rows, customer, notes, internalNote, generalDiscount]);

  // Detect unsaved changes: any row with a product, OR a selected customer, OR notes/discount entered.
  const isDirty = useMemo(() => {
    if (savedRef.current) return false;
    if (quoteGoneRef.current) return false;
    if (rows.some((r) => r.product_id)) return true;
    if (customer) return true;
    if ((notes || "").trim().length > 0) return true;
    if ((internalNote || "").trim().length > 0) return true;
    if (Number(generalDiscount) > 0) return true;
    return false;
  }, [rows, customer, notes, internalNote, generalDiscount]);

  useUnsavedChangesGuard({
    isDirty,
    onSave: () => saveQuote("draft", { skipNavigate: true, silent: true }),
  });

  // Auto-save then run an action (open dialog / navigate) in a single click.
  const saveThen = async (action: (qid: string) => void) => {
    let id = editId;
    if (isDirty || !id) {
      const ok = await saveQuote("draft", { skipNavigate: true, silent: true });
      if (!ok) return;
      id = lastSavedIdRef.current || id;
      if (!id) return;
      if (!editId) {
        window.history.replaceState({}, "", isSideMode ? `/quotes/side/edit/${id}` : `/quotes/edit/${id}`);
      }
    }
    action(id);
  };

  // ---------- Render ----------
  return (
    <div ref={pageRef} className={`neo-quote-scope${isSideMode ? " neo-quote-scope-side" : ""}`} dir="rtl" style={{ position: "relative" }}>
      <style>{`
        .neo-quote-scope { background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: 12px; height: calc(100vh - 64px); overflow: hidden; container-type: inline-size; }
        @media (max-width: 767px) {
          .neo-quote-scope-side .quote-layout > aside { display: flex !important; }
          .neo-quote-scope-side .quote-layout { display: flex !important; flex-direction: column !important; height: auto !important; min-height: 100%; }
          .neo-quote-scope-side { height: auto !important; overflow: auto !important; }
          .neo-quote-scope-side .quote-layout > aside { width: 100% !important; max-width: 100% !important; min-height: 320px; }
          /* Mobile: stack form column above the recent-quotes sidebar so the items table is visible */
          .neo-quote-scope { height: auto !important; min-height: calc(100vh - 64px); overflow: auto !important; }
          .neo-quote-scope .quote-layout { display: flex !important; flex-direction: column !important; height: auto !important; min-height: calc(100vh - 80px); }
          .neo-quote-scope .quote-layout > aside { width: 100% !important; max-width: 100% !important; min-height: 280px; }
          .neo-quote-scope .form-column { min-height: 70vh; height: auto; }
          /* ارتفاع ثابت لجدول البنود على الجوال حتى تظهر صفوف TableFiller الفارغة دائماً قبل الأزرار */
          .neo-quote-scope .items-table-wrap { height: 55vh !important; min-height: 360px !important; max-height: 60vh !important; flex: 0 0 auto !important; }
          .neo-quote-scope .items-scroll { height: 100% !important; min-height: 0 !important; max-height: none !important; }
        }
        .neo-quote-scope .panel { background: hsl(var(--card)); border-radius: 6px; padding: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.04); border: 1px solid hsl(var(--border)); }
        .neo-quote-scope .quick-add-row { background: hsl(var(--muted)); padding:2px 4px; border-radius:6px; border:1px solid hsl(var(--border)); margin-bottom: 6px; display: grid; grid-template-columns: 4fr 70px 1fr 1fr 1fr 1fr auto; gap: 4px; align-items: center; }
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
        .neo-quote-scope .search-suggestions .price-badge { background: hsl(var(--success)); color: hsl(var(--success-foreground)); padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; }
        /* Global styles for product suggestions portal (renders to document.body) */
        .search-suggestions { background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); border:1px solid hsl(var(--border)); border-radius:6px; max-height:220px; overflow-y:auto; box-shadow:0 4px 12px rgba(0,0,0,.12); font-size:12px; }
        .search-suggestions .item { padding:5px 8px; cursor:pointer; border-bottom:1px solid hsl(var(--border)); display:flex; justify-content:space-between; gap:6px; font-size:11px; font-weight:700; }
        .search-suggestions .item:hover,
        .search-suggestions .item[data-active="true"] { background: hsl(var(--accent) / 0.18); outline: 2px solid hsl(var(--primary) / 0.4); outline-offset: -2px; }
        .search-suggestions .price-badge { background: hsl(var(--success)); color: hsl(var(--success-foreground)); padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; white-space:nowrap; }
        .search-suggestions .suggestions-status { cursor: default; justify-content: center; font-size: 11px; color: hsl(var(--muted-foreground)); padding: 8px; font-style: italic;  font-weight: 700;}
        .search-suggestions .suggestions-status[data-status="loading"]::before { content: ""; display: inline-block; width: 10px; height: 10px; border: 2px solid hsl(var(--primary)); border-top-color: transparent; border-radius: 50%; margin-inline-end: 6px; animation: sugg-spin 0.7s linear infinite; vertical-align: middle; }
        .search-suggestions .suggestions-status[data-status="empty"] { color: hsl(var(--destructive)); }
        @keyframes sugg-spin { to { transform: rotate(360deg); } }
        .neo-quote-scope .item_header { background: #2563eb !important; color: #ffffff !important; }
        .neo-quote-scope .item_header th { padding: 5px 4px; font-weight:600; font-size: 11px; text-align: center; background: #2563eb !important; color: #ffffff !important; border-color: #2563eb !important; }
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
        .neo-quote-scope .row-grid { display:grid; gap:6px; }
        .neo-quote-scope .header-grid { grid-template-columns: 1fr 1fr 1fr; }
        .neo-quote-scope .actions-grid { display:flex; gap:4px; justify-content:flex-end; }
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
        .neo-quote-scope .excel-table { table-layout: fixed; }
        /* .items-scroll layout موحّد في ItemsScroll */
      `}</style>

      <div className="quote-layout" style={{ padding: 3, height: "100%" }}>
        {/* ============ المحتوى الرئيسي ============ */}
        <div className="form-column">
          {/* ============ Header: شريط واحد ============ */}
          <div className="header-bar" style={{ flexShrink: 0, height: "auto" }}>
            {/* hidden marker للاختبارات E2E لقراءة الرقم المُولَّد */}
            <span data-testid="doc-number" data-doc-kind={isSideMode ? "side-quote" : "quote"} style={{ display: "none" }}>{quoteNumber}</span>
            {/* Customer search (مع رقم العرض + التاريخ مدمجين في نفس المستطيل) */}
            <div className="field product-search-container" style={{ position: "relative", flex: `0 0 ${CUSTOMER_FIELD_BASE + (custExtras[0] || 0)}px`, minWidth: 0 }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span>العميل</span>
                <div
                  title={editId ? "رقم العرض المحفوظ والتاريخ" : "رقم العرض المقترح والتاريخ"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    height: 18,
                    padding: "0 4px",
                    border: "1px solid hsl(var(--primary) / 0.4)",
                    borderRadius: 3,
                    background: "hsl(var(--primary) / 0.08)",
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--primary))", lineHeight: 1, whiteSpace: "nowrap" }}>
                    #{quoteNumber || "—"}
                  </span>
                  <input
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                    title="تاريخ عرض السعر"
                    style={{ fontSize: 10, height: 16, padding: "0 2px", border: "none", background: "transparent", color: "hsl(var(--foreground))", fontWeight: 600, outline: "none" }}
                  />
                </div>
              </label>
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
                    if (customerMatches[0] && !customer) {
                      pickCustomer(customerMatches[0]);
                    } else {
                      quickProductRef.current?.focus();
                    }
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
                  background: "#28a745",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  width: 28,
                  minWidth: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                +
              </button>
            </div>



            {/* Warehouse */}
            <div className="field" style={{ width: HEADER_FIELD_BASES[1] + (hdrExtras[1] || 0) }}>
              <label>المستودع</label>
              <select
                className="form-control"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                style={{ minWidth: 0, width: "100%", fontSize: 12 }}
              >
                <option value="">كل المستودعات</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {!colsLocked && <ExpandFieldButton currentExtra={hdrExtras[1] || 0} onDrag={(v) => hdrSetExtra(1, v)} onReset={() => hdrReset(1)} />}
            </div>

            {/* حقل label رابع: تفاصيل العميل — نفس ارتفاع باقي الحقول */}
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
          

          {/* ============ Quick-add row ============ */}
          <div className="quick-add-row" style={{ marginTop: 6, flexShrink: 0, gridTemplateColumns: quickGrid(QUICK_BASE_QUOTE) }}>
            {/* Product search */}
            <div className="product-search-container quick-add-field" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                onClick={() => setShowQuickAddProduct(true)}
                title="إضافة منتج جديد"
                aria-label="إضافة منتج جديد"
                style={{ flex: "0 0 auto", width: 28, height: 28, background: "#2563eb", color: "#ffffff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 18, fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              >+</button>
              <input
                ref={quickProductRef}
                data-nav-col="product"
                type="text"
                className="form-control"
                placeholder="ابحث عن منتج..."
                data-quick-search="quote"
                value={quickRow.productSearch}
                onChange={(e) =>
                  setQuickRow((r) => ({ ...r, productSearch: e.target.value, showSuggestions: true, product_id: null }))
                }
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
              <SuggestionsPortal anchorSelector='[data-quick-search="quote"]' open={quickRow.showSuggestions} width={suggWidth}>
                <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                  <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                  {(() => {
                    const matches = productMatches(quickRow.productSearch);
                    if (productsLoading) {
                      return <div className="item suggestions-status" data-status="loading">جارٍ تحميل المنتجات…</div>;
                    }
                    if (!quickRow.productSearch.trim()) {
                      return <div className="item suggestions-status" data-status="hint">اكتب للبحث ({products.length} منتج)</div>;
                    }
                    if (matches.length === 0) {
                      return <div className="item suggestions-status" data-status="empty">لا توجد نتائج</div>;
                    }
                    return matches.map((p, i) => (
                      <div
                        key={p.id}
                        className="item"
                        data-sugg-item
                        data-active={i === 0 ? "true" : "false"}
                        onMouseDown={() => pickProductIntoQuick(p)}
                      >
                        <span>{p.name}</span>
                        <span style={{ marginRight: 4, padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.12)", color: Number(p.stock_quantity) > 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)", border: `1px solid ${Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.35)" : "hsl(0 84% 60% / 0.3)"}`, flexShrink: 0 }}>
                          {Number(p.stock_quantity).toLocaleString()}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </SuggestionsPortal>
            </div>

            {/* Quantity */}
            <div className="quick-add-field">
              <input
                ref={quickQtyRef}
                data-nav-col="quantity"
                type="number"
                className="form-control text-center"
                placeholder="الكمية"
                value={quickRow.quantity || ""}
                onChange={(e) =>
                  setQuickRow((r) => {
                    const q = Number(e.target.value) || 0;
                    const updated = { ...r, quantity: q };
                    updated.total = calcTotal(updated);
                    return updated;
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQuickRowToTable();
                  }
                }}
              />
              <ExpandFieldButton currentExtra={quickExtras[1] || 0} onDrag={(v) => quickSetExtra(1, v)} onReset={() => quickReset(1)} />
            </div>

            {/* Local price (auto = foreign × rate) */}
            <div className="quick-add-field">
              <input step="any"
                type="number"
                className="form-control text-center"
                placeholder="المحلي"
                data-nav-col="unit_price"
                value={quickRow.unit_price || ""}
                onChange={(e) =>
                  setQuickRow((r) => {
                    const up = Number(e.target.value) || 0;
                    const updated = { ...r, unit_price: up };
                    updated.total = calcTotal(updated);
                    return updated;
                  })
                }
              />
              <ExpandFieldButton currentExtra={quickExtras[2] || 0} onDrag={(v) => quickSetExtra(2, v)} onReset={() => quickReset(2)} />
            </div>

            {/* Foreign price */}
            <div className="quick-add-field">
              <input step="any"
                type="number"
                className="form-control text-center"
                placeholder="$ السعر الأجنبي"
                data-nav-col="foreign_price"
                value={quickRow.foreign_price || ""}
                onChange={(e) =>
                  setQuickRow((r) => {
                    const fp = Number(e.target.value) || 0;
                    const updated = { ...r, foreign_price: fp, unit_price: fp * r.exchange_rate };
                    updated.total = calcTotal(updated);
                    return updated;
                  })
                }
              />
              <ExpandFieldButton currentExtra={quickExtras[3] || 0} onDrag={(v) => quickSetExtra(3, v)} onReset={() => quickReset(3)} />
            </div>

            {/* Exchange rate */}
            <div className="quick-add-field">
              <input
                ref={quickRateRef}
                data-nav-col="exchange_rate"
                type="number"
                step="0.01"
                className="form-control text-center"
                placeholder="معدل التحويل"
                value={quickRow.exchange_rate}
                onChange={(e) => {
                  const er = Number(e.target.value) || 1;
                  setQuickRow((r) => {
                    const updated = { ...r, exchange_rate: er, unit_price: r.foreign_price * er };
                    updated.total = calcTotal(updated);
                    return updated;
                  });
                  setRows((prev) => prev.map((row) => {
                    const updated = { ...row, exchange_rate: er, unit_price: row.foreign_price * er };
                    updated.total = calcTotal(updated);
                    return updated;
                  }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQuickRowToTable();
                  }
                }}
              />
              <ExpandFieldButton currentExtra={quickExtras[4] || 0} onDrag={(v) => quickSetExtra(4, v)} onReset={() => quickReset(4)} />
            </div>

            {/* Add button */}
            <button type="button" className="btn btn-primary btn-sm" onClick={addQuickRowToTable} style={{ background: "#2563eb", color: "#ffffff", border: "none" }}>
              + إضافة
            </button>
          </div>
          {/* ============ Bulk actions toolbar ============ */}
          {rows.some((r) => r.selected) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 10px",
                background: "#fff3cd",
                border: "1px solid #ffeeba",
                borderRadius: 6,
                marginBottom: 6,
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                تم تحديد {rows.filter((r) => r.selected).length} بند
              </span>
              <button type="button" className="btn btn-danger btn-sm" onClick={deleteSelectedRows}>
                حذف المحدد
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleSelectAll(false)}>
                إلغاء التحديد
              </button>
            </div>
          )}

          {/* ============ Items table ============ */}
          <div className="items-table-wrap" style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #e6e6ee", flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* In-form search box to filter table rows */}
            <ItemsScroll ref={itemsScrollRef}>
            <table className="excel-table" style={{ width: "100%", tableLayout: "fixed", boxSizing: "border-box" }} {...tableProps}>
              <colgroup>
                {colWidths.map((w, i) => (
                  <col key={i} style={w != null ? { width: w } : (colMinWidths[i] != null ? { minWidth: colMinWidths[i]! } : undefined)} />
                ))}
              </colgroup>
              <thead>
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
                    <button
                      type="button"
                      title={COLS_BTN_EDIT_TITLE}
                      onClick={() => { setColsLocked(false); toast(COLS_TOAST_EDIT_MODE); }}
                      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", fontSize: 7, lineHeight: 1, padding: 0, margin: 0, border: "none", background: "hsl(var(--muted))", color: "hsl(var(--foreground))", cursor: "pointer", whiteSpace: "nowrap", boxSizing: "border-box", userSelect: "none" }}
                    >
                      {COLS_BTN_EDIT_LABEL}
                    </button>
                    <ColumnResizeHandle onMouseDown={(e) => startColDrag(6, e)} hidden={colsLocked} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const visibleRows = rows.filter((r) => {
                    const q = tableSearch.trim();
                    if (!q) return true;
                    return startsWithAny([r.product_name, r.productSearch], q);
                  });
                  const NAV_COLS = ["product", "quantity", "unit_price", "foreign_price", "total"];
                  const handleNav = makeRowNavHandler({
                    tableId: "quote-items",
                    cols: NAV_COLS,
                    getRowCount: () => visibleRows.length,
                  });
                  return visibleRows.map((r, idx, arr) => {
                  return (
                  <React.Fragment key={r.uid}>
                    <tr className={`excel-row ${r.selected ? "row-selected-danger" : ""} ${isSpacePending(r.uid) ? "row-pending-delete" : ""}`} onKeyDown={(e) => handleSpaceDelete(r.uid, e)}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={(e) => updateRow(r.uid, { selected: e.target.checked })}
                        />
                      </td>
                      {/* Product search per-row */}
                      <td>
                        <div className="product-search-container">
                          <input
                            type="text"
                            className="form-control"
                            placeholder="اكتب اسم المنتج..."
                            data-row-search={r.uid}
                            data-nav-table="quote-items"
                            data-nav-row={idx}
                            data-nav-col="product"
                            value={r.productSearch}
                            onChange={(e) =>
                              updateRow(r.uid, { productSearch: e.target.value, showSuggestions: true, product_id: null })
                            }
                            
                            onBlur={() => setTimeout(() => updateRow(r.uid, { showSuggestions: false }), 150)}
                            onKeyDown={(e) => handleNav(idx, "product", e, { skipVertical: !!r.showSuggestions })}
                          />
                          <SuggestionsPortal anchorSelector={`[data-row-search="${r.uid}"]`} open={r.showSuggestions} width={suggWidth}>
                            <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                              <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                              {r.showSuggestions && (() => {
                                const matches = productMatches(r.productSearch, r.uid);
                                if (productsLoading) {
                                  return <div className="item suggestions-status" data-status="loading">جارٍ تحميل المنتجات…</div>;
                                }
                                if (!r.productSearch.trim()) {
                                  return <div className="item suggestions-status" data-status="hint">اكتب للبحث ({products.length} منتج)</div>;
                                }
                                if (matches.length === 0) {
                                  return <div className="item suggestions-status" data-status="empty">لا توجد نتائج</div>;
                                }
                                return matches.map((p, i) => (
                                  <div
                                    key={p.id}
                                    className="item"
                                    data-sugg-item
                                    data-active={i === 0 ? "true" : "false"}
                                    onMouseDown={() => pickProductIntoRow(r.uid, p)}
                                  >
                                    <span>{p.name}</span>
                                    <span style={{ marginRight: 4, padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.12)", color: Number(p.stock_quantity) > 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)", border: `1px solid ${Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.35)" : "hsl(0 84% 60% / 0.3)"}`, flexShrink: 0 }}>
                                      {Number(p.stock_quantity).toLocaleString()}
                                    </span>
                                  </div>
                                ));
                              })()}
                            </div>
                          </SuggestionsPortal>
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-control text-center"
                          value={r.quantity}
                          data-nav-table="quote-items" data-nav-row={idx} data-nav-col="quantity"
                          onKeyDown={(e) => handleNav(idx, "quantity", e)}
                          onChange={(e) => updateRow(r.uid, { quantity: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td>
                        <input step="any"
                          type="number"
                          className="form-control text-center"
                          value={r.unit_price || ""}
                          data-nav-table="quote-items" data-nav-row={idx} data-nav-col="unit_price"
                          onKeyDown={(e) => handleNav(idx, "unit_price", e)}
                          onChange={(e) => {
                            // كتابة يدوية تتجاوز الحساب
                            setRows((prev) =>
                              prev.map((row) => {
                                if (row.uid !== r.uid) return row;
                                const up = Number(e.target.value) || 0;
                                const merged = { ...row, unit_price: up };
                                merged.total = calcTotal(merged);
                                return merged;
                              }),
                            );
                          }}
                          style={{ background: "#fff8e6" }}
                        />
                      </td>
                      <td>
                        <input step="any"
                          type="number"
                          className="form-control text-center"
                          value={r.foreign_price || ""}
                          data-nav-table="quote-items" data-nav-row={idx} data-nav-col="foreign_price"
                          onKeyDown={(e) => handleNav(idx, "foreign_price", e)}
                          onChange={(e) => updateRow(r.uid, { foreign_price: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="text-center" style={{ fontWeight: 700, color: "#28a745", outline: "none" }}
                          tabIndex={0}
                          data-nav-table="quote-items" data-nav-row={idx} data-nav-col="total"
                          onKeyDown={(e) => handleNav(idx, "total", e)}>
                        {r.total.toLocaleString()}
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setItemNoteEditing({ uid: r.uid, productName: r.product_name, value: r.note || "" })}
                          title={r.note || "إضافة ملاحظة"}
                          style={{
                            padding: "2px 8px",
                            background: r.note ? "#2563eb" : "#ffffff",
                            color: r.note ? "#ffffff" : "#475569",
                            border: r.note ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
                            borderRadius: 4,
                          }}
                        >
                          📝
                        </button>
                      </td>
                      <td className="text-center">
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRow(r.uid)}>
                          ×
                        </button>
                      </td>
                    </tr>
                     {r.note && (
                       <tr className="excel-row" style={{ background: "#eff6ff" }}>
                         <td colSpan={8} style={{ padding: "4px 12px", fontSize: 12, color: "#1d4ed8", whiteSpace: "pre-wrap" }}>
                          📝 <strong>ملاحظة:</strong> {r.note}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                  });
                })()}
                <TableFiller scrollRef={itemsScrollRef} realRowsCount={rows.length} columnsCount={colWidths.length} />
              </tbody>
            </table>
            </ItemsScroll>
          </div>



          {/* ============ Bottom action bar (summary + buttons، كل عنصر قابل للسحب والتخصيص) ============ */}
          <ToolbarCustomizationProvider storageKey="quote-create">
          <div dir="rtl" style={{ marginTop: 6, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <FreePositionToolbar
              screenKey="quote-create-toolbar"
              withCustomizeButtons
              zoom={{ value: itemsZoom, inc: itemsZoomInc, dec: itemsZoomDec }}
              items={[
                // === خصم على المجموع ===
                {
                  id: "general-discount",
                  group: "0-summary",
                  useHandle: true,
                  defaultLabel: "خصم",
                  node: (
                    <SummaryChip
                      screenKey="quote-create-toolbar"
                      id="general-discount"
                      defaultLabel="خصم"
                      value={
                        <input
                          type="number"
                          min={0}
                          value={generalDiscount || ""}
                          onChange={(e) => setGeneralDiscount(Number(e.target.value) || 0)}
                          placeholder="0"
                          style={{
                            width: 90,
                            height: 24,
                            padding: "2px 8px",
                            textAlign: "center",
                            border: "1px solid #f59e0b",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 700,
                            background: "#fef3c7",
                            color: "#92400e",
                          }}
                        />
                      }
                    />
                  ),
                },
                // === المجموع ===
                {
                  id: "sum-total",
                  group: "0-summary",
                  useHandle: true,
                  defaultLabel: "المجموع",
                  node: (
                    <SummaryChip
                      screenKey="quote-create-toolbar"
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
                // === عدد المنتجات ===
                {
                  id: "items-count",
                  group: "0-summary",
                  useHandle: true,
                  defaultLabel: "عدد",
                  node: (
                    <SummaryChip
                      screenKey="quote-create-toolbar"
                      id="items-count"
                      defaultLabel="عدد"
                      value={`${rows.filter((r) => r.product_id).length}`}
                      valueStyle={{
                        display: "inline-block",
                        minWidth: 36,
                        height: 24,
                        padding: "2px 8px",
                        textAlign: "center",
                        border: "1px solid #2563eb",
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        background: "#dbeafe",
                        color: "#1e40af",
                      }}
                    />
                  ),
                },

                // === واتساب ===
                {
                  id: "whatsapp",
                  group: "3-share",
                  node: (
                    <button
                      onClick={async () => {
                        if (!customer?.phone) { toast.error("لا يوجد رقم هاتف للعميل"); return; }
                        if (!editId) { toast.error("احفظ عرض السعر أولاً لإرسال رابطه"); return; }
                        const tId = toast.loading("جاري إنشاء رابط المشاركة...");
                        try {
                          const { data: sess } = await supabase.auth.getSession();
                          const accessToken = sess?.session?.access_token;
                          if (!accessToken) throw new Error("يجب تسجيل الدخول");
                          const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
                          const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                          const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-document-share-token`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, apikey: ANON },
                            body: JSON.stringify({ doc_type: "quote", doc_id: editId, ttl_hours: 168 }),
                          });
                          const json = await resp.json();
                          if (!resp.ok) throw new Error(json.error || "فشل إنشاء الرابط");
                          toast.dismiss(tId);
                          const msg = `مرحباً ${customer.name} 👋\n📄 عرض سعر رقم: ${quoteNumber}\n💰 الإجمالي: ${totals.total.toLocaleString()} ${companyCurrency}\n\nرابط عرض السعر:\n${json.url}`;
                          openWhatsApp(pickCustomerWhatsApp(customer), msg);
                          const { markQuoteAsSent } = await import("@/utils/quoteSentStatus");
                          await markQuoteAsSent(editId);
                        } catch (err: any) {
                          toast.dismiss(tId);
                          toast.error(err?.message || "فشل إنشاء رابط المشاركة");
                        }
                      }}
                      title="إرسال واتساب مع رابط عرض السعر"
                      style={btnStyle("#10b981")}
                    >
                      <MessageCircle size={14} /> واتساب
                    </button>
                  ),
                },

                // === مسح ===
                {
                  id: "cancel",
                  group: "4-meta",
                  node: isAdmin ? (
                    <button
                      className="btn btn-sm"
                      style={{
                        background: "hsl(var(--destructive))",
                        color: "hsl(var(--destructive-foreground))",
                        borderColor: "hsl(var(--destructive))",
                        fontWeight: 700,
                      }}
                      onClick={() => setClearConfirmOpen(true)}
                      title="مسح بيانات عرض السعر الحالي بالكامل"
                    >
                      مسح
                    </button>
                  ) : null,
                },

                // === إضافة ترحيل ===
                {
                  id: "transport",
                  group: "2-files",
                  node: (
                    <button
                      onClick={() => saveThen(() => setTransportDialogOpen(true))}
                      title="إضافة ترحيل"
                      style={btnStyle("#16a34a")}
                    >
                      <Truck size={14} /> ترحيل
                    </button>
                  ),
                },

                // === ملاحظات ===
                {
                  id: "notes",
                  group: "2-files",
                  node: (
                    <button type="button"
                      onClick={() => { setNotesDraft(notes || ""); setNotesDialogOpen(true); }}
                      title={notes ? "تعديل الملاحظة" : "إضافة ملاحظة"}
                      style={{
                        ...btnStyle(notes ? "#2563eb" : "#ffffff"),
                        color: notes ? "#ffffff" : "#475569",
                        border: notes ? "1px solid #2563eb" : "1px solid #cbd5e1",
                      }}>
                      <StickyNote size={16} />
                    </button>
                  ),
                },

                // === تحويل لفاتورة (ظاهر دائماً، لا يعمل إلا بعد الحفظ) ===
                {
                  id: "convert-to-invoice",
                  group: "2-files",
                  node: (
                    <button
                      type="button"
                      data-toolbar-id="convert-to-invoice"
                      disabled={!editId}
                      onClick={async (e) => {
                        if (!editId) {
                          toast.error("احفظ عرض السعر أولاً ثم اضغط على \"تحويل لفاتورة\"");
                          return;
                        }
                        // حارس التراكب: تحقّق أن مركز هذا الزر هو فعلاً
                        // أعلى عنصر قابل للنقر، وإلا فهو متراكب مع زر آخر
                        const btn = e.currentTarget as HTMLElement;
                        const r = btn.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const top = document.elementFromPoint(cx, cy) as HTMLElement | null;
                        const topBtn = top?.closest("[data-toolbar-id], button");
                        if (
                          topBtn &&
                          topBtn !== btn &&
                          !btn.contains(topBtn) &&
                          !topBtn.contains(btn)
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          const otherLabel =
                            (topBtn as HTMLElement).getAttribute("title") ||
                            (topBtn as HTMLElement).innerText?.trim().slice(0, 30) ||
                            "زر آخر";
                          toast.error(
                            `لا يمكن تنفيذ "تحويل لفاتورة": الزر متراكب مع "${otherLabel}". رتّب شريط الأدوات (وضع التخصيص) ثم أعد المحاولة.`
                          );
                          return;
                        }

                        if (!confirm(`تحويل العرض ${quoteNumber} إلى فاتورة؟ سيُحفظ العرض بحالة "مقبول/محوّل" ويظهر في سجل التحويلات.`)) return;
                        const ok = await saveQuote("draft", { skipNavigate: true, silent: true });
                        if (!ok) return;
                        try {
                          const { convertQuoteToInvoice } = await import("@/utils/quoteToInvoice");
                          const { invoiceId, invoiceNumber, alreadyConverted } = await convertQuoteToInvoice(editId);
                          quoteGoneRef.current = true;
                          showConverted({ invoiceId, invoiceNumber, alreadyConverted, quoteId: editId });
                        } catch (e: any) {
                          toast.error(e.message || "فشل تحويل العرض إلى فاتورة");
                        }
                      }}
                      title={editId ? "تحويل عرض السعر إلى فاتورة" : "احفظ عرض السعر أولاً لتفعيل التحويل"}
                      style={{
                        ...btnStyle("#7c3aed"),
                        opacity: editId ? 1 : 0.5,
                        cursor: editId ? "pointer" : "not-allowed",
                      }}
                    >
                      <FileText size={14} /> تحويل لفاتورة
                    </button>
                  ),
                },



                // === تغيير حالة العرض ===
                {
                  id: "quote-status",
                  group: "2-status",
                  node: (() => {
                    const STATUS_OPTS: Record<string, { label: string; bg: string; fg: string }> = {
                      draft:    { label: "عرض سعر", bg: "#7c3aed", fg: "#fff" },
                      sent:     { label: "مرسل",  bg: "#5da6fb", fg: "#fff" },
                      accepted: { label: "مقبول", bg: "#5ed45e", fg: "#fff" },
                      rejected: { label: "مرفوض", bg: "#848030", fg: "#fff" },
                    };
                    const cur = STATUS_OPTS[quoteWorkflowStatus] || STATUS_OPTS.draft;
                    return (
                      <select
                        value={quoteWorkflowStatus}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          setQuoteWorkflowStatus(newStatus);
                          if (editId) {
                            const { error } = await supabase
                              .from("quotes")
                              .update({ status: newStatus })
                              .eq("id", editId);
                            if (error) {
                              toast.error(`فشل تغيير الحالة: ${error.message}`);
                              return;
                            }
                            toast.success(`تم تغيير الحالة إلى: ${STATUS_OPTS[newStatus]?.label || newStatus}`);
                          } else {
                            toast.message(`الحالة المختارة: ${STATUS_OPTS[newStatus]?.label || newStatus} — ستُحفظ مع العرض`);
                          }
                        }}
                        title="تغيير حالة عرض السعر"
                        style={{
                          height: 26,
                          padding: "2px 8px",
                          border: "none",
                          borderRadius: 4,
                          background: cur.bg,
                          color: cur.fg,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          minWidth: 100,
                        }}
                      >
                        {Object.entries(STATUS_OPTS).map(([k, v]) => (
                          <option key={k} value={k} style={{ background: "#fff", color: "#1a1a1a" }}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    );
                  })(),
                },

                {
                  id: "print",
                  group: "3-share",
                  node: (
                    <button type="button" onClick={() => handlePrint("full", false)} style={btnStyle("#ef4444")} title="طباعة">
                      <Printer size={14} /> طباعة
                    </button>
                  ),
                },

                // === حفظ ===
                {
                  id: "save",
                  group: "1-primary",
                  node: (
                    <button
                      className="btn btn-sm"
                      onClick={() => saveQuote("draft")}
                      style={btnStyle("#2563eb")}
                      title="حفظ عرض السعر"
                      disabled={savingQuote}
                    >
                      {savingQuote ? "جاري الحفظ..." : "حفظ"}
                    </button>
                  ),
                },
                // === حفظ وجديد ===
                {
                  id: "save-and-new",
                  group: "1-primary",
                  node: (
                    <button
                      className="btn btn-sm"
                      onClick={() => saveQuote("draft", { andNew: true })}
                      style={btnStyle("#0ea5e9")}
                      title="حفظ والانتقال إلى عرض سعر جديد"
                      disabled={savingQuote}
                    >
                      + جديد
                    </button>
                  ),
                },
              ]}
            />
          </div>
          </ToolbarCustomizationProvider>
        </div>
        <PanelResizer storageKey="panels:quote-create:sidebar" scopeSelector=".neo-quote-scope" />
        <aside className="recent-quotes-scope" style={{ alignSelf: "stretch", height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <RecentItemsSidebar type="quotes" compact sideOnly={isSideMode} />
          <RowResizer storageKey="rows:quote-create:recent-density" scopeSelector=".recent-quotes-scope" cssVar="recent-density" mode="scale" defaultHeight={1.0} min={0.6} max={2.5} />
        </aside>
      </div>

      {/* ============ Notes Dialog ============ */}
      <ItemNoteDialog
        open={!!itemNoteEditing}
        initialValue={itemNoteEditing?.value || ""}
        productName={itemNoteEditing?.productName}
        onSave={(text) => { if (itemNoteEditing) updateRow(itemNoteEditing.uid, { note: text }); }}
        onClose={() => setItemNoteEditing(null)}
      />

      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ملاحظات للعميل</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="ملاحظات تظهر في عرض السعر المطبوع..."
            rows={6}
            className="resize-none"
          />
          <DialogFooter className="gap-2">
            {notes && (
              <Button
                variant="destructive"
                onClick={() => { setNotes(""); setNotesDraft(""); setNotesDialogOpen(false); }}
              >
                حذف
              </Button>
            )}
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => { setNotes(notesDraft); setNotesDialogOpen(false); }}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Clear/Delete Confirmation ============ */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={(o) => !clearing && setClearConfirmOpen(o)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "hsl(var(--destructive))" }}>
              مسح عرض السعر الحالي
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editId
                ? `هل تريد حذف عرض السعر ${quoteNumber || ""} بالكامل من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`
                : "هل تريد مسح جميع بيانات عرض السعر الحالي؟"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>لا</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              style={{ background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))" }}
              onClick={async (e) => {
                e.preventDefault();
                setClearing(true);
                try {
                  if (editId) {
                    // 1) Delete packaging items (children of quotes_packaging)
                    const { data: pkgs } = await supabase
                      .from("quotes_packaging")
                      .select("id")
                      .eq("quote_id", editId);
                    const pkgIds = (pkgs || []).map((p: any) => p.id);
                    if (pkgIds.length) {
                      await supabase.from("quotes_packaging_items").delete().in("quote_packaging_id", pkgIds);
                    }

                    // 2) Delete attachments — storage files first, then DB rows
                    const { data: attachments } = await supabase
                      .from("quote_attachments")
                      .select("id, file_url")
                      .eq("quote_id", editId);
                    if (attachments && attachments.length) {
                      const marker = "/quote-attachments/";
                      const paths: string[] = [];
                      for (const a of attachments as any[]) {
                        const idx = (a.file_url || "").indexOf(marker);
                        if (idx >= 0) paths.push((a.file_url as string).substring(idx + marker.length));
                      }
                      if (paths.length) {
                        try { await supabase.storage.from("quote-attachments").remove(paths); } catch {}
                      }
                      await supabase.from("quote_attachments").delete().eq("quote_id", editId);
                    }

                    // 3) Delete other children
                    await supabase.from("quote_items").delete().eq("quote_id", editId);
                    await supabase.from("quotes_packaging").delete().eq("quote_id", editId);
                    await supabase.from("quote_transports").delete().eq("quote_id", editId);

                    // 4) Finally delete the quote itself
                    const { error } = await supabase.from("quotes").delete().eq("id", editId);
                    if (error) { toast.error(error.message); setClearing(false); return; }
                    quoteGoneRef.current = true;
                    savedRef.current = true;

                    toast.success(
                      quoteNumber
                        ? `تم حذف عرض السعر «${quoteNumber}» بالكامل من قاعدة البيانات`
                        : "تم حذف عرض السعر بالكامل من قاعدة البيانات",
                      { duration: 5000, description: "تم حذف البنود والمرفقات والتغليف والنقل" }
                    );
                    setClearConfirmOpen(false);
                    navigate(isSideMode ? "/quotes/side/new" : "/quotes/new");
                    return;
                  }
                  setRows([]);
                  setCustomer(null);
                  setCustomerSearch("");
                  setNotes("");
                  setInternalNote("");
                  setGeneralDiscount(0);
                  setQuoteDate(new Date().toISOString().slice(0, 10));
                  setQuoteNumber("");
                  setQuickRow(newRow(defaultRate));
                  setTableSearch("");
                  setQuoteWorkflowStatus("draft");
                  toast.success("تم مسح بيانات عرض السعر — سيتم استخدام رقم جديد عند الحفظ");
                  setClearConfirmOpen(false);
                } catch (err: any) {
                  toast.error(err?.message || "فشل المسح");
                } finally {
                  setClearing(false);
                }
              }}
            >
              {clearing ? "جارٍ الحذف..." : "نعم، احذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerFormDialog
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        onSaved={handleCustomerSaved}
      />

      {editId && (
        <QuoteAttachmentsDialog
          quoteId={editId}
          open={showAttachments}
          onClose={() => setShowAttachments(false)}
        />
      )}

      

      {editId && (
        <>
          <PackagingDialog
            open={packagingDialogOpen}
            onOpenChange={setPackagingDialogOpen}
            parentType="quote"
            parentId={editId}
          />
          <TransportDialog
            open={transportDialogOpen}
            onOpenChange={setTransportDialogOpen}
            parentType="quote"
            parentId={editId}
            customerId={customer?.id || null}
          />
        </>
      )}

      <QuickAddProductDialog
        open={showQuickAddProduct}
        onOpenChange={setShowQuickAddProduct}
        initialName={quickRow.productSearch}
        onCreated={(p: any) => {
          const exists = rows.some((r) => r.product_id === p.id);
          if (exists) {
            notifyDuplicateItem(p.name);
            return;
          }
          const fp = Number(p.foreign_price) || Number(p.sale_price) || 0;
          const base = newRow(defaultRate);
          const item: QuoteItem = {
            ...base,
            uid: crypto.randomUUID(),
            product_id: p.id,
            product_name: p.name,
            productSearch: p.name,
            foreign_price: fp,
            unit_price: fp * base.exchange_rate,
            quantity: Number(p.stock_quantity) || 1,
            unit: p.unit,
            showSuggestions: false,
          };
          item.total = calcTotal(item);
          setRows((prev) => [...prev.filter((r) => r.product_id), item]);
          setQuickRow(newRow(defaultRate));
          setTimeout(() => quickProductRef.current?.focus(), 0);
        }}
      />
      {ConvertedDialog}

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
              const p = line.matched;
              const existingIdx = next.findIndex((r) => r.product_id === p.id);
              if (existingIdx >= 0) {
                const ex = { ...next[existingIdx] };
                ex.quantity = ex.quantity + line.qty;
                ex.total = calcTotal(ex);
                next[existingIdx] = ex;
                continue;
              }
              const fp = Number(p.foreign_price) || Number(p.sale_price) || 0;
              const base = newRow(defaultRate);
              const item: QuoteItem = {
                ...base,
                uid: crypto.randomUUID(),
                product_id: p.id,
                product_name: p.name,
                productSearch: p.name,
                foreign_price: fp,
                unit_price: fp * base.exchange_rate,
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
      <ColumnsEditFloatingPanel
        open={!colsLocked}
        pageKey="quote-create"
        onSaveDefault={() => { saveColsAsDefault(); toast.success("تم تعيين عرض الأعمدة كافتراضي"); }}
        onReset={() => { resetColWidths(); toast.success("تم إعادة عرض الأعمدة"); }}
        onSave={() => { try { setColsLocked(true); toast.success(COLS_TOAST_SAVED); } catch { toast.error(COLS_TOAST_SAVE_FAILED); } }}
      />
    </div>
  );
}
