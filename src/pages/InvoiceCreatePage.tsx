import React, { useState, useEffect, useMemo, useRef } from "react";
import { notifyDuplicateItem } from "@/utils/duplicateItemToast";
import { useQueryClient } from "@tanstack/react-query";
import { usePageRenderCount } from "@/hooks/usePageRenderCount";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllProducts } from "@/lib/fetchAllProducts";
import { startsWithAny, startsWithMatch } from "@/utils/searchMatch";
import { toast } from "sonner";
import { validateBankTransferPayment, isAllowedBank, filterAccountsForPayment } from "@/lib/bankTransferValidation";
import { Plus, Edit, Printer, MessageCircle, FileText, StickyNote, Image as ImageIcon, Package, Truck, Wallet } from "lucide-react";
import StatusButton, { WORKFLOW_STATUS_OPTIONS, INVOICE_STATUS_OPTIONS } from "@/components/StatusButton";
import { invalidateWorkflowAutoCache } from "@/components/invoice/WorkflowStatusBadge";
import RecentItemsSidebar from "@/components/RecentItemsSidebar";
import PanelResizer from "@/components/PanelResizer";
import RowResizer from "@/components/RowResizer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { generatePrintHTML, openPrintWindow } from "@/utils/printTemplate";
import { loadInvoiceExtras } from "@/utils/printExtras";
import { deductStockForLines, applyStockDeltaForLines } from "@/utils/stockDeduction";
import PrintMenu, { type PrintVariant } from "@/components/PrintMenu";
import { generateWhatsAppLink, openWhatsApp, pickCustomerWhatsApp} from "@/utils/whatsapp";
import { getCurrencies, getLatestRate, type Currency } from "@/utils/currency";
import { useScreenZoom } from "@/hooks/useScreenZoom";
import { useColumnWidths, useContainerFit, ColumnResizeHandle, useScreenColsLocked, screenColWidthsKey, migrateScreenColKeys, COLS_TOAST_SAVED, COLS_TOAST_SAVE_FAILED, COLS_TOAST_EDIT_MODE, COLS_BTN_SAVE_LABEL, COLS_BTN_EDIT_LABEL, COLS_BTN_SAVE_TITLE, COLS_BTN_EDIT_TITLE } from "@/hooks/useColumnWidths";
import { useSuggestionsWidth, SuggestionsResizeHandle } from "@/hooks/useSuggestionsWidth";
import { SuggestionsPortal } from "@/components/SuggestionsPortal";
import { ItemsScroll } from "@/components/items/ItemsScroll";
import { TableFiller } from "@/components/items/TableFiller";
import { useQuickRowWidths, ExpandFieldButton } from "@/hooks/useQuickRowWidths";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { makeRowNavHandler } from "@/utils/itemTableNav";
import { useCreatePageNav } from "@/utils/createPageNav";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";
import { useUserRole } from "@/hooks/useUserRole";

import { recordInvoiceRevision } from "@/utils/invoiceRevisions";
import PackagingDialog from "@/components/packaging/PackagingDialog";
import InvoiceAttachmentsDialog from "@/components/invoice/InvoiceAttachmentsDialog";
import TransportDialog from "@/components/transport/TransportDialog";
import QuickAddProductDialog from "@/components/product/QuickAddProductDialog";
import ItemNoteDialog from "@/components/invoice/ItemNoteDialog";
import FreePositionToolbar from "@/components/toolbar/FreePositionToolbar";
import SummaryChip from "@/components/toolbar/SummaryChip";
import { ToolbarCustomizationProvider } from "@/components/toolbar/ToolbarCustomizationContext";
import { productMatches as sharedProductMatches } from "@/utils/productMatches";
import MessageImportDialog, { MessageImportButton } from "@/components/MessageImportDialog";
import type { ParsedLine } from "@/hooks/useMessageImport";
import { ALLOWED_INVOICE_STATUSES, computeInvoiceStatusAfterPayment, isAllowedInvoiceStatus } from "@/utils/invoiceStatus";
import { splitPayment } from "@/utils/overpayment";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import { CustomerInfoStrip } from "@/utils/balanceDisplay";
import ColumnsEditFloatingPanel from "@/components/ColumnsEditFloatingPanel";

/** Keyboard navigation — مطابق لعرض السعر */
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
        root.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")
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

      // Up/Down داخل شريط الإضافة السريع: تنقّل بين الحقول بدل تغيير قيمة input[type=number]
      const inQuickAdd = !!target.closest(".quick-add-row");
      if (inQuickAdd && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const col = target.getAttribute("data-nav-col");
        if (e.key === "ArrowDown") {
          let candidate: HTMLElement | null = null;
          const quickAddEl = target.closest(".quick-add-row") as HTMLElement | null;
          // الخطوة 1: إن لم نكن على حقل البحث/المنتج داخل quick-add، انتقل إليه أولاً
          if (col !== "product" && quickAddEl) {
            candidate = quickAddEl.querySelector<HTMLElement>('[data-nav-col="product"]');
          }
          // الخطوة 2: على حقل المنتج (أو لم يوجد) → انزل إلى نفس العمود في جدول البنود
          if (!candidate) {
            if (col) candidate = root.querySelector<HTMLElement>(`[data-nav-table][data-nav-col="${col}"]`);
            if (!candidate) candidate = root.querySelector<HTMLElement>("[data-nav-table]");
          }
          nextEl = candidate;
        } else {
          // ArrowUp: أقرب حقل قابل للتركيز قبل شريط الإضافة (رأس الفاتورة/العميل)
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
  foreign_price: number | null;
  unit: string | null;
  stock_quantity: number | null;
  warehouse_id?: string | null;
}

interface InvRow {
  uid: string;
  dbId?: string | null;
  product_id: string | null;
  product_name: string;
  productSearch: string;
  quantity: number;
  foreign_price: number;
  exchange_rate: number;
  unit_price: number;
  discount: number;
  total: number;
  unit: string | null;
  showSuggestions: boolean;
  selected: boolean;
  note: string;
}

function newRow(rate: number = 1): InvRow {
  return {
    uid: crypto.randomUUID(),
    dbId: null,
    product_id: null,
    product_name: "",
    productSearch: "",
    quantity: 1,
    foreign_price: 0,
    exchange_rate: rate,
    unit_price: 0,
    discount: 0,
    total: 0,
    unit: null,
    showSuggestions: false,
    selected: false,
    note: "",
  };
}

function calcTotal(r: InvRow): number {
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

// بصمة مختصرة لبنود الفاتورة لاكتشاف ما إن تغيّرت قبل الحفظ
function invoiceItemsHash(items: Array<{ product_id?: string | null; quantity?: any; unit_price?: any; foreign_price?: any; discount?: any; unit?: any; product_name?: any }>): string {
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

export default function InvoiceCreatePage({ pos = false }: { pos?: boolean } = {}) {
  usePageRenderCount("/invoices/create");
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { zoom: itemsZoom, inc: itemsZoomInc, dec: itemsZoomDec } = useScreenZoom("invoice-create");
  // Unified item-table columns: [action, product(flex), qty, foreign$, price, total, dup, trailing]
  const colsScreenId = "invoice-create";
  if (typeof window !== "undefined") migrateScreenColKeys(colsScreenId);
  const [colsLocked, setColsLocked] = useScreenColsLocked(colsScreenId);
  const { widths: colWidths, minWidths: colMinWidths, startDrag: startColDrag, reset: resetColWidths, saveAsUserDefault: saveColsAsDefault, tableProps, clampWidthsToContainer } = useColumnWidths(
    screenColWidthsKey(colsScreenId),
    [36, null, 80, 100, 100, 100, 36, 40],
    colsLocked,
  );
  const { width: suggWidth, startDrag: startSuggDrag } = useSuggestionsWidth("invoice-create:suggWidth");
  const QUICK_BASE_INVOICE = ["4fr", "70px", "1fr", "1fr", "1fr", "auto"];
  const { extras: quickExtras, setExtra: quickSetExtra, reset: quickReset, getGridTemplate: quickGrid } = useQuickRowWidths("invoice-create:quickRowWidths", 5);
  const CUSTOMER_FIELD_BASE = 260;
  const { extras: custExtras, setExtra: custSetExtra, reset: custReset } = useQuickRowWidths("invoice-create:customerFieldWidth", 1);
  // Header field widths (date, warehouse, customer-info)
  const HEADER_FIELD_BASES = [130, 140, 130, 120];
  const { extras: hdrExtras, setExtra: hdrSetExtra, reset: hdrReset } = useQuickRowWidths("invoice-create:headerFieldsWidth", 3);
  const { id: editId } = useParams();
  const isCash = location.pathname.includes("/cash");
  const isEdit = !!editId;

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [company, setCompany] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [lastPayment, setLastPayment] = useState<{ amount: number; status: string; currency?: string } | null>(null);
  const [customerBalances, setCustomerBalances] = useState<{ debt: number; credit: number } | null>(null);

  // Header
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const selectedCustomerIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedCustomerIdRef.current = customer?.id || null;
  }, [customer]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSugg, setShowCustomerSugg] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // Add customer dialog
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // Currency
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyCode, setCurrencyCode] = useState("SDG");
  const [exchangeRateToBase, setExchangeRateToBase] = useState(1);

  // Notes / discount / shipping
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [notes, setNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [itemNoteEditing, setItemNoteEditing] = useState<{ uid: string; productName?: string; value: string } | null>(null);
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [attachmentsDialogOpen, setAttachmentsDialogOpen] = useState(false);
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);

  // Default exchange rate
  const [defaultRate, setDefaultRate] = useState<number>(1);

  // Quick add row + table rows
  const [quickRow, setQuickRow] = useState<InvRow>(newRow());
  const [rows, setRows] = useState<InvRow[]>([]);
  const itemsScrollRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef(false);
  const lastSavedIdRef = useRef<string | null>(null);
  // معرّف الفاتورة بعد أول حفظ في وضع الإنشاء — يُستخدم لتركيب الحوارات (المستندات/التغليف/الترحيل)
  // لأن window.history.replaceState لا يُحدِّث useParams.
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  // بصمة بنود الفاتورة كما حُمِّلت من قاعدة البيانات؛ تُستخدم لتخطّي إعادة كتابة البنود وعمليات المخزون إن لم تتغيّر
  const originalItemsHashRef = useRef<string | null>(null);
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
    const raw = sessionStorage.getItem(`invoice-edit-scroll:${editId}`);
    if (!raw) return;
    try {
      const { page, items } = JSON.parse(raw);
      requestAnimationFrame(() => {
        window.scrollTo({ top: page || 0, behavior: 'auto' });
        if (itemsScrollRef.current) itemsScrollRef.current.scrollTop = items || 0;
      });
      sessionStorage.removeItem(`invoice-edit-scroll:${editId}`);
    } catch {}
  }, [editId, rows.length === 0]);
  const [tableSearch, setTableSearch] = useState("");
  const [productHeaderSearch, setProductHeaderSearch] = useState(false);

  const [saving, setSaving] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<string>("new");
  const [invoiceStatus, setInvoiceStatus] = useState<string>("pending");

  // ---------- Payment dialog state ----------
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [savedCustomerId, setSavedCustomerId] = useState<string | null>(null);
  const [savedTotal, setSavedTotal] = useState<number>(0);
  const [savedPaid, setSavedPaid] = useState<number>(0);
  const [savedDue, setSavedDue] = useState<number>(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payAccount, setPayAccount] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState<string>("");
  const [payRef, setPayRef] = useState<string>("");
  const [payDiscount, setPayDiscount] = useState<string>("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [showMessageImport, setShowMessageImport] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { isAdmin } = useUserRole();
  const customerInputRef = useRef<HTMLInputElement>(null);
  const quickProductRef = useRef<HTMLInputElement>(null);
  const quickQtyRef = useRef<HTMLInputElement>(null);
  const quickRateRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useKeyboardNav(pageRef);
  useCreatePageNav({ rootRef: pageRef, customerRef: customerInputRef, itemsTableId: "invoice-items" });

  // ---------- Initial load ----------
  useEffect(() => {
    (async () => {
      setProductsLoading(true);
      const [cs, ps, cfg] = await Promise.all([
        supabase.from("customers").select("id,name,phone,balance,company").order("name"),
        fetchAllProducts<Product>("id,name,sale_price,foreign_price,unit,stock_quantity,is_frozen,warehouse_id"),
        supabase.from("company_settings").select("*").maybeSingle(),
      ]);
      if (cs.data) setCustomers(cs.data as Customer[]);
      setProducts((ps as any[]).filter((x:any)=>!x.is_frozen) as any);
      setProductsLoading(false);
      if (cfg.data) setCompany(cfg.data);
      if (!editId) {
        // Numbering: رقم افتراضي عشوائي لكل فاتورة جديدة لتفادي التكرار
        // (POS و Regular لكل منهما بادئة مستقلة)
        const prefix = pos
          ? ((cfg.data as any)?.pos_invoice_prefix || "POS-")
          : (cfg.data?.invoice_prefix || "INV-");
        const { generateRandomDocNumber } = await import("@/utils/randomDocNumber");
        const candidate = await generateRandomDocNumber("invoices", "invoice_number", prefix, {
          scope: (q) => (pos ? q.eq("source", "pos") : q.neq("source", "pos")),
        });
        setInvoiceNumber(candidate);
      }
    })();

    supabase.from("accounts").select("id,name,bank_name,account_type").order("name").then(({ data }) => {
      if (data) setAccounts(data);
    });

    supabase.from("warehouses").select("id,name").order("name").then(({ data }) => {
      if (data) setWarehouses(data as any);
    });

    getCurrencies().then((list) => {
      setCurrencies(list);
      const base = list.find((c) => c.is_base);
      if (base && !editId) setCurrencyCode(base.code);
    });

    // Refetch products when stock changes elsewhere (purchase receipt,
    // invoice creation/edit) or when the user returns to this tab.
    const refetchProducts = async () => {
      setProductsLoading(true);
      const ps = await fetchAllProducts<Product>("id,name,sale_price,foreign_price,unit,stock_quantity,is_frozen,warehouse_id");
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
          const { data: bal } = await supabase
            .from("customers")
            .select("balance, credit_balance")
            .eq("id", currentId)
            .maybeSingle();
          if (bal) {
            setCustomerBalances({
              debt: Number((bal as any).balance || 0),
              credit: Number((bal as any).credit_balance || 0),
            });
          }
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

  useEffect(() => {
    if (!currencyCode) return;
    getLatestRate(currencyCode).then(setExchangeRateToBase);
  }, [currencyCode]);

  // جلب آخر دفعة للعميل المختار
  useEffect(() => {
    if (!customer?.id) { setLastPayment(null); setCustomerBalances(null); return; }
    (async () => {
      const { data: bal } = await supabase
        .from("customers")
        .select("balance, credit_balance")
        .eq("id", customer.id)
        .maybeSingle();
      if (bal) setCustomerBalances({ debt: Number((bal as any).balance || 0), credit: Number((bal as any).credit_balance || 0) });
      else setCustomerBalances(null);
    })();
    (async () => {
      const { data } = await supabase
        .from("transactions")
        .select("amount, reference_id, date")
        .eq("customer_id", customer.id)
        .eq("type", "income")
        .in("category", ["invoice_payment", "customer_credit"])
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const t: any = (data || [])[0];
      if (!t) { setLastPayment(null); return; }
      let status = "—";
      if (t.reference_id) {
        const { data: inv } = await supabase
          .from("invoices")
          .select("total, paid_amount, currency_code")
          .eq("id", t.reference_id)
          .maybeSingle();
        if (inv) {
          const total = Number((inv as any).total || 0);
          const paid = Number((inv as any).paid_amount || 0);
          if (paid >= total && total > 0) status = "كاملة";
          else if (paid > 0) status = "جزئية";
          setLastPayment({ amount: Number(t.amount || 0), status, currency: (inv as any).currency_code });
          return;
        }
      }
      setLastPayment({ amount: Number(t.amount || 0), status });
    })();
  }, [customer?.id]);

  useEffect(() => {
    if (editId) return;
    (async () => {
      const { data: er } = await supabase
        .from("exchange_rates")
        .select("rate_to_base")
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rate = Number(er?.rate_to_base || 1);
      if (rate && rate > 0 && rate !== 1) {
        setDefaultRate(rate);
        setQuickRow((r) => (r.product_id ? r : { ...r, exchange_rate: rate, unit_price: r.foreign_price * rate }));
        setRows((prev) => prev.map((r) => (r.product_id ? r : { ...r, exchange_rate: rate, unit_price: r.foreign_price * rate })));
      }
    })();
  }, [editId]);

  // ---------- Load invoice for edit ----------
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const { data: inv } = await supabase
        .from("invoices").select("*").eq("id", editId).maybeSingle();
      if (!inv) { toast.error("الفاتورة غير موجودة"); navigate("/invoices"); return; }
      setInvoiceNumber(inv.invoice_number);
      setInvoiceDate(inv.date);
      setDueDate(inv.due_date || "");
      setNotes(inv.notes || "");
      setInternalNote(inv.internal_note || "");
      setGeneralDiscount(Number(inv.discount) || 0);
      setShipping(Number(inv.shipping) || 0);
      setPaymentMethod(inv.payment_method || "cash");
      setWorkflowStatus((inv as any).workflow_status || "new");
      setInvoiceStatus((inv as any).status || "pending");
      setSavedCustomerId(inv.customer_id || null);
      setSavedTotal(Number(inv.total) || 0);
      setSavedPaid(Number(inv.paid_amount) || 0);
      setSavedDue(Number(inv.due_amount) || 0);
      if (inv.currency_code) setCurrencyCode(inv.currency_code);
      if (inv.exchange_rate_to_base) setExchangeRateToBase(Number(inv.exchange_rate_to_base));
      if (inv.customer_id) {
        const { data: c } = await supabase.from("customers")
          .select("id,name,phone,balance,company").eq("id", inv.customer_id).maybeSingle();
        if (c) { setCustomer(c as Customer); setCustomerSearch((c as Customer).name); }
      }
      const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", editId);
      if (items?.length) {
        const firstWh = (items as any[]).find((i: any) => i.warehouse_id)?.warehouse_id;
        if (firstWh) setWarehouseId(firstWh);
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
        // احفظ بصمة البنود الأصلية لتخطّي إعادة الكتابة وعمليات المخزون لاحقاً إن لم تتغيّر
        originalItemsHashRef.current = invoiceItemsHash(mapped);
      } else {
        originalItemsHashRef.current = "";
      }
    })();
  }, [editId, navigate]);

  // ---------- Search ----------
  const customerMatches = useMemo(() => {
    if (!customerSearch.trim()) return [];
    return customers
      .filter((c) => startsWithAny([c.name, c.phone], customerSearch))
      .slice(0, 8);
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
    setRows((prev) => prev.map((r) => {
      if (r.uid !== rowUid) return r;
      const fp = Number(p.foreign_price) || Number(p.sale_price) || 0;
      const up = fp * r.exchange_rate;
      const updated: InvRow = {
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
    }));
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
      const updated: InvRow = {
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

  function updateRow(uid: string, patch: Partial<InvRow>) {
    setRows((prev) => prev.map((r) => {
      if (r.uid !== uid) return r;
      const merged = { ...r, ...patch };
      if ("foreign_price" in patch || "exchange_rate" in patch) {
        merged.unit_price = merged.foreign_price * merged.exchange_rate;
      }
      merged.total = calcTotal(merged);
      return merged;
    }));
  }

  async function removeRow(uid: string) {
    const target = rows.find((r) => r.uid === uid);
    if (!target) return;
    // إذا كان البند محفوظاً في قاعدة البيانات: احذفه + أرجع الكمية إلى المخزون فوراً
    if (target.dbId && editId) {
      try {
        if (target.product_id && Number(target.quantity) > 0) {
          await applyStockDeltaForLines(
            [{ product_id: target.product_id, quantity: Number(target.quantity) }],
            [],
          );
        }
        const { error } = await supabase.from("invoice_items").delete().eq("id", target.dbId);
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

  function openPaymentDialog() {
    if (!editId) { toast.info("احفظ الفاتورة أولاً"); return; }
    setPayAmount(String(savedDue || savedTotal || 0));
    setPayMethod(paymentMethod || "cash");
    setPayAccount(accounts[0]?.id || "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNote(`دفعة لفاتورة رقم ${invoiceNumber}`);
    setPayRef("");
    setPayDiscount("");
    setPaymentDialogOpen(true);
  }

  const isBankMethod = (m: string) => m === "bank_transfer" || m === "bank";

  async function handleRecordPayment() {
    if (!editId) return;
    const amount = parseFloat(payAmount) || 0;
    const discount = Math.max(0, parseFloat(payDiscount) || 0);
    if (amount <= 0 && discount <= 0) { toast.error("أدخل مبلغ دفعة أو خصم صحيح"); return; }
    if (isBankMethod(payMethod) && amount > 0) {
      const selectedAcc = (accounts as any[])?.find((a: any) => a.id === payAccount);
      const err = validateBankTransferPayment({ method: payMethod, account: selectedAcc, referenceNo: payRef });
      if (err) { toast.error(err); return; }
    }
    setSavingPayment(true);
    try {
      // الخصم يُعامَل كأنه قيمة سُدِّدت من المتبقي → يُضاف إلى المدفوع المنطقي لقفل الفاتورة.
      // الفائض يُقسَّم تلقائياً: الجزء المغطّي يَقفل الفاتورة، والباقي يُسجَّل كسلفة لصالح العميل.
      const _total = Number(savedTotal) || 0;
      const split = splitPayment({
        amount: amount + discount,
        total: _total,
        alreadyPaid: Number(savedPaid) || 0,
      });
      const newPaid = split.newPaid;
      const newDue = split.newDue;
      const newSt = computeInvoiceStatusAfterPayment({ total: _total, paidAfter: newPaid });

      // فحص جهة العميل: تأكد أن status ضمن القيم المسموحة في قاعدة البيانات
      if (!isAllowedInvoiceStatus(newSt)) {
        toast.error(`قيمة حالة الفاتورة غير مسموحة: "${newSt}". القيم المسموحة: ${ALLOWED_INVOICE_STATUSES.join("، ")}`);
        setSavingPayment(false);
        return;
      }

      const refSuffix = isBankMethod(payMethod) && payRef.trim() ? ` - رقم العملية: ${payRef.trim()}` : "";
      const discountSuffix = discount > 0 ? ` - خصم: ${discount.toLocaleString()}` : "";
      const finalNote = `${payNote || ""}${refSuffix}${discountSuffix}`.trim();

      const { error: upErr } = await supabase.from("invoices").update({
        paid_amount: newPaid,
        due_amount: newDue,
        status: newSt,
        payment_method: payMethod || paymentMethod,
      }).eq("id", editId);
      if (upErr) throw upErr;

      // كم من المبلغ النقدي الفعلي طُبِّق على الفاتورة (بعد خصم الخصم) وكم تجاوز كفائض
      const cashApplied = Math.max(0, split.applied - discount);
      const cashOver = Math.max(0, amount - cashApplied);

      // 1) قيد الدفعة المطبَّقة على الفاتورة
      if (payAccount && cashApplied > 0) {
        await supabase.from("transactions").insert({
          type: "income",
          amount: cashApplied,
          date: payDate,
          description: finalNote,
          account_id: payAccount,
          customer_id: savedCustomerId,
          reference_id: editId,
        } as any);
      }
      // 2) قيد الفائض كسلفة/دائن للعميل
      if (payAccount && cashOver > 0) {
        await supabase.from("transactions").insert({
          type: "income",
          amount: cashOver,
          date: payDate,
          description: `فائض دفعة فاتورة - سلفة عميل${refSuffix}`,
          account_id: payAccount,
          customer_id: savedCustomerId,
          reference_id: editId,
          category: "customer_credit",
        } as any);
      }

      await recordInvoiceRevision({
        invoiceId: editId,
        action: "payment",
        changes: {
          paid_amount: { before: savedPaid, after: newPaid },
          status: { before: invoiceStatus, after: newSt },
          ...(discount > 0 ? { discount_on_payment: { before: 0, after: discount } } : {}),
          ...(cashOver > 0 ? { customer_credit: { before: 0, after: cashOver } } : {}),
        },
        note: `دفعة بقيمة ${amount}${discount > 0 ? ` + خصم ${discount}` : ""}${cashOver > 0 ? ` (مطبَّق ${cashApplied} + سلفة ${cashOver})` : ""} - ${payMethod || ""}${refSuffix}`,
      });

      setSavedPaid(newPaid);
      setSavedDue(newDue);
      setInvoiceStatus(newSt);
      toast.success(cashOver > 0
        ? `تم تسجيل الدفعة: ${cashApplied} على الفاتورة + ${cashOver} كسلفة لصالح العميل`
        : "تم تسجيل الدفعة");
      setPaymentDialogOpen(false);
    } catch (e: any) {
      const raw = String(e?.message || "تعذر تسجيل الدفعة");
      const isConstraint =
        e?.code === "23514" ||
        /violates check constraint/i.test(raw) ||
        /invoices_status_check/i.test(raw);

      if (isConstraint) {
        const isStatusConstraint = /invoices_status_check/i.test(raw);
        const fixHint = isStatusConstraint
          ? `قيمة حالة الفاتورة غير مقبولة. المسموح فقط: ${ALLOWED_INVOICE_STATUSES.join("، ")}. تحقق من المبلغ والإجمالي ثم أعد المحاولة.`
          : "البيانات المُرسَلة لا تستوفي قيود قاعدة البيانات. راجع القيم المُدخلة ثم أعد المحاولة.";

        toast.error("فشل حفظ الدفعة", {
          description: `${fixHint}\n\nتفاصيل تقنية: ${raw}`,
          duration: 15000,
          action: {
            label: "إعادة المحاولة",
            onClick: () => { void handleRecordPayment(); },
          },
        });
      } else {
        toast.error(raw, {
          action: {
            label: "إعادة المحاولة",
            onClick: () => { void handleRecordPayment(); },
          },
        });
      }
    } finally {
      setSavingPayment(false);
    }
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
    const subtotal = validRows.reduce((s, r) => s + (r.quantity * r.unit_price), 0);
    const itemDiscounts = validRows.reduce((s, r) => s + (r.quantity * r.unit_price * (r.discount / 100)), 0);
    const afterGeneral = subtotal - itemDiscounts - generalDiscount;
    const total = afterGeneral + shipping;
    return { subtotal, itemDiscounts, taxAmount: 0, total: Math.round(total * 100) / 100 };
  }, [rows, generalDiscount, shipping]);

  // ---------- Save ----------
  async function saveInvoice(opts: { andNew?: boolean; skipNavigate?: boolean; silent?: boolean } = {}): Promise<boolean> {
    // حارس متزامن لمنع الإدراج المتوازي/المكرر (نقر مزدوج، saveThen + نقر يدوي، StrictMode...)
    if (isSavingRef.current) return false;
    isSavingRef.current = true;
    let activeCustomer = customer;
    // إن لم يُختَر عميل من القائمة لكن يوجد اسم/رقم نصي حر، أنشئ/طابق العميل تلقائياً (للآجل والكاش)
    if (!activeCustomer) {
      const freeText = (customerSearch || "").trim();
      const isCashMode = isCash;
      if (!freeText) {
        if (!isCashMode) { toast.error("اختر عميلاً أو اكتب اسمه"); return false; }
        // كاش بدون أي اسم/رقم → ضيف مجهول
      } else {
        // تطبيع رقم الهاتف: إزالة المسافات/الشرطات/الأقواس/النقاط، وتحويل 00 البادئة إلى +
        const normalizePhone = (s: string) =>
          s.replace(/[\s\-()._]/g, "").replace(/^00/, "+");
        // استخراج رقم الهاتف من داخل النص الحر (مثل: "أحمد 0912345678")
        const phoneMatch = freeText.match(/\+?[\d\s\-()._]{6,}/);
        const extractedPhone = phoneMatch ? normalizePhone(phoneMatch[0]) : "";
        const hasEmbeddedPhone = /^\+?\d{6,}$/.test(extractedPhone);
        const namePart = hasEmbeddedPhone
          ? freeText.replace(phoneMatch![0], "").trim().replace(/[,،\-]+$/g, "").trim()
          : freeText;
        const phoneCandidate = normalizePhone(freeText);
        const looksLikePhone = /^\+?\d{4,}$/.test(phoneCandidate);

        // ابحث بالاسم أولاً (الجزء الاسمي إن وُجد، وإلا النص كاملاً)
        const { findExistingCustomerByName } = await import("@/utils/customerMatch");
        let existing: any = namePart ? await findExistingCustomerByName(namePart) : null;

        // مطابقة بالهاتف (سواء النص بالكامل رقم، أو رقم مُستخرَج من داخل النص)
        const phoneToMatch = looksLikePhone ? phoneCandidate : (hasEmbeddedPhone ? extractedPhone : "");
        if (!existing && phoneToMatch) {
          const variants = new Set<string>([phoneToMatch]);
          if (phoneToMatch.startsWith("+")) variants.add(phoneToMatch.slice(1));
          else variants.add("+" + phoneToMatch);
          // أضِف صيغة الإدخال الخام لتغطية المخزَّن بمسافات/شرطات
          if (phoneMatch) variants.add(phoneMatch[0].trim());
          const { data: byPhone } = await supabase
            .from("customers")
            .select("*")
            .in("phone", Array.from(variants))
            .limit(1)
            .maybeSingle();
          if (byPhone) existing = byPhone;
        }

        // مطابقة مركّبة: اسم + هاتف (إن لم يطابق أيٌّ منهما منفرداً، جرّب التركيبة عبر LIKE على الهاتف)
        if (!existing && namePart && phoneToMatch) {
          const last = phoneToMatch.replace(/^\+/, "").slice(-7); // آخر 7 أرقام
          if (last.length >= 6) {
            const { data: combos } = await supabase
              .from("customers")
              .select("*")
              .ilike("phone", `%${last}%`)
              .limit(20);
            const { normalizeCustomerName } = await import("@/utils/customerMatch");
            const targetName = normalizeCustomerName(namePart);
            const match = (combos || []).find(
              (c: any) => normalizeCustomerName(c.name || "") === targetName
            );
            if (match) existing = match;
          }
        }

        if (existing) {
          activeCustomer = existing as any;
          toast.message(`تم استخدام العميل الموجود: ${existing.name}`);
        } else {
          const { data: { user: _cu } } = await supabase.auth.getUser();
          const insertPayload: any = {
            name: hasEmbeddedPhone && namePart
              ? namePart
              : (looksLikePhone ? `عميل ${phoneCandidate}` : freeText),
            phone: hasEmbeddedPhone ? extractedPhone : (looksLikePhone ? phoneCandidate : null),
            created_by_uid: _cu?.id || null,
          };
          const { data: created, error: cErr } = await supabase
            .from("customers")
            .insert(insertPayload)
            .select("*")
            .single();
          if (cErr) { toast.error(`تعذّر إنشاء العميل: ${cErr.message}`); return false; }
          activeCustomer = created as any;
          toast.message(`تم إنشاء عميل جديد: ${insertPayload.name}`);
          // إخطار الشاشات الأخرى بالعميل الجديد
          try { window.dispatchEvent(new Event("customers:changed")); } catch {}
        }
        // مزامنة الواجهة
        setCustomer(activeCustomer as any);
        setCustomerSearch((activeCustomer as any).name || freeText);
        setSavedCustomerId((activeCustomer as any).id);
        setCustomers((prev) =>
          prev.some((p) => p.id === (activeCustomer as any).id)
            ? prev
            : [activeCustomer as any, ...prev]
        );
      }
    }
    const validRows = rows.filter((r) => r.product_id);
    if (!validRows.length) { toast.error("أضف منتجاً واحداً على الأقل"); return false; }

    setSaving(true);
    try {
      // احسب حالة الدفع بناءً على المبلغ المدفوع المحفوظ والإجمالي الجديد
      // - كاش: مدفوع بالكامل
      // - غير ذلك: حافظ على paid_amount السابق (إن وُجد)، ثم احسب الحالة:
      //   paid >= total => paid، paid > 0 => partially_paid، وإلا pending
      const prevPaid = editId ? Math.max(0, Number(savedPaid) || 0) : 0;
      const computedPaid = isCash ? totals.total : prevPaid;
      const computedDue = Math.max(0, Number(totals.total || 0) - computedPaid);
      // هامش تسامح 0.01 لمنع أخطاء التقريب في تحديد الحالة
      const _totalNum = Number(totals.total || 0);
      const computedStatus = (_totalNum > 0 && computedPaid >= _totalNum - 0.01)
        ? "paid"
        : computedPaid > 0.01 ? "partial" : "pending";

      const payload: any = {
        invoice_number: invoiceNumber,
        customer_id: pos ? null : (activeCustomer ? activeCustomer.id : null),
        type: (isCash || pos) ? "cash" : "sale",
        date: invoiceDate,
        due_date: dueDate || null,
        subtotal: totals.subtotal,
        discount: generalDiscount + totals.itemDiscounts,
        shipping,
        total: totals.total,
        due_amount: pos ? 0 : computedDue,
        paid_amount: pos ? totals.total : computedPaid,
        status: pos ? "paid" : computedStatus,
        payment_method: pos ? "cash" : paymentMethod,
        currency_code: currencyCode,
        exchange_rate_to_base: exchangeRateToBase,
        notes,
        internal_note: internalNote,
        ...(pos ? { source: "pos", walk_in_customer_name: walkInName.trim() || "عميل نقدي" } : {}),
      };

      let invId = editId;
      let oldItems: Array<{ product_id: string | null; quantity: number }> = [];
      // احسب البصمة الحالية للبنود وقارنها بالأصلية المحمَّلة من قاعدة البيانات
      const currentItemsHash = invoiceItemsHash(validRows);
      const itemsUnchanged = !!editId && originalItemsHashRef.current !== null && originalItemsHashRef.current === currentItemsHash;
      let recordExisted = true;

      if (editId) {
        // منع التكرار في وضع التعديل: لو التعديل يطابق فاتورة أخرى لنفس العميل/اليوم/البنود
        if (activeCustomer?.id) {
          const itemsForHash = validRows.map((r) => ({
            product_id: r.product_id || null,
            quantity: Number(r.quantity || 0),
          }));
          try {
            const { data: dup } = await (supabase as any).rpc("find_duplicate_invoice", {
              _customer_id: activeCustomer.id,
              _date: invoiceDate,
              _items: itemsForHash,
              _exclude_invoice_id: editId,
            });
            const dupRow = Array.isArray(dup) ? dup[0] : dup;
            if (dupRow?.id) {
              toast.error(
                `هذا التعديل يطابق فاتورة موجودة (${dupRow.invoice_number}) — سيتم فتح الفاتورة الأصلية لتطبيق التعديل عليها بدلاً من تكرارها.`,
                { duration: 6000 }
              );
              setSaving(false);
              navigate(`/invoices/edit/${dupRow.id}`);
              return false;
            }
          } catch (e) {
            console.warn("[duplicate-check:edit] failed", e);
          }
        }

        // UPDATE مباشر بدون SELECT وقائي مسبق؛ نتحقق من العدد المُعاد لمعرفة إن كان السجل موجوداً
        const { data: updated, error } = await supabase
          .from("invoices")
          .update(payload)
          .eq("id", editId)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) {
          toast.message("الفاتورة السابقة غير موجودة — سيتم إنشاء فاتورة جديدة");
          invId = undefined;
          recordExisted = false;
        } else if (!itemsUnchanged) {
          // البنود تغيّرت — اقرأ القديمة لحساب فرق المخزون ثم احذف
          const { data: prev } = await supabase
            .from("invoice_items")
            .select("product_id, quantity")
            .eq("invoice_id", editId);
          oldItems = (prev || []).map((p: any) => ({ product_id: p.product_id, quantity: p.quantity }));
          await (supabase as any).rpc("delete_invoice_items_silent", { p_invoice_id: editId });
        }
      }

      if (!invId) {
        // منع تكرار: نفس العميل + نفس اليوم + نفس المنتجات والكميات
        if (activeCustomer?.id) {
          const itemsForHash = validRows.map((r) => ({
            product_id: r.product_id || null,
            quantity: Number(r.quantity || 0),
          }));
          try {
            const { data: dup } = await (supabase as any).rpc("find_duplicate_invoice", {
              _customer_id: activeCustomer.id,
              _date: invoiceDate,
              _items: itemsForHash,
              _exclude_invoice_id: null,
            });
            const dupRow = Array.isArray(dup) ? dup[0] : dup;
            if (dupRow?.id) {
              toast.error(
                `هذه الفاتورة موجودة بالفعل (${dupRow.invoice_number}) — سيتم فتحها للتعديل بدلاً من إنشاء نسخة جديدة.`,
                { duration: 5000 }
              );
              setSaving(false);
              navigate(`/invoices/edit/${dupRow.id}`);
              return false;
            }
          } catch (e) {
            // لا نوقف الحفظ إذا فشل فحص التكرار، فقط نسجّل في الكونسول
            console.warn("[duplicate-check] failed", e);
          }
        }
        // attach creator for RLS / staff filtering
        const { data: { user: _u } } = await supabase.auth.getUser();
        (payload as any).created_by_uid = _u?.id || null;
        // محاولة الإدراج مع إعادة توليد الرقم تلقائياً عند تعارض المفتاح الفريد
        const prefix = pos
          ? ((company as any)?.pos_invoice_prefix || "POS-")
          : (company?.invoice_prefix || "INV-");
        const padLen = (() => {
          const m = invoiceNumber.match(/(\d+)$/);
          return m ? m[1].length : 4;
        })();
        let attempt = 0;
        let lastError: any = null;
        let currentNumber = invoiceNumber;
        while (attempt < 5) {
          const tryPayload = { ...payload, invoice_number: currentNumber };
          const { data, error } = await supabase.from("invoices").insert(tryPayload).select("id,invoice_number").single();
          if (!error) {
            invId = data.id;
            if (data.invoice_number !== invoiceNumber) {
              setInvoiceNumber(data.invoice_number);
              toast.message(`تم تعديل رقم الفاتورة إلى ${data.invoice_number} لتفادي التكرار`);
            }
            lastError = null;
            break;
          }
          lastError = error;
          // إذا كان الخطأ تكرار رقم الفاتورة، أعد جلب أعلى رقم وحاول مجدداً
          const isDup = (error as any).code === "23505" || /duplicate key|invoices_invoice_number_key/i.test(error.message || "");
          if (!isDup) throw error;
          // اجلب أعلى رقم موجود لإعادة الحساب بدقة (مفصول حسب نوع الفاتورة pos / regular)
          let allQ = supabase
            .from("invoices")
            .select("invoice_number,source")
            .like("invoice_number", `${prefix}%`);
          if (pos) allQ = allQ.eq("source", "pos");
          else allQ = allQ.neq("source", "pos");
          const { data: all } = await allQ;
          let maxN = 0;
          (all || []).forEach((r: any) => {
            const m = String(r.invoice_number).match(/(\d+)$/);
            if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
          });
          currentNumber = `${prefix}${String(maxN + 1 + attempt).padStart(padLen, "0")}`;
          attempt++;
        }
        if (lastError) throw lastError;
      }

      // إعادة كتابة البنود وعمليات المخزون فقط إن تغيّرت البنود أو كنا أنشأنا سجلاً جديداً
      let deductionInfo: { name: string; delta: number }[] = [];
      let didDeduct = false;
      const skipItemsWrite = recordExisted && itemsUnchanged;
      if (!skipItemsWrite) {
        const rawItemsPayload = validRows.map((r) => {
          const prod = products.find((p) => p.id === r.product_id);
          const wid = (prod?.warehouse_id) || warehouseId || null;
          return {
            invoice_id: invId!,
            product_id: r.product_id,
            product_name: r.product_name,
            quantity: r.quantity,
            unit_price: r.unit_price,
            foreign_price: r.foreign_price,
            discount: r.discount,
            total: r.total,
            unit: r.unit,
            warehouse_id: wid,
          };
        });
        // دفاع ثانٍ: إزالة الأسطر المتطابقة تماماً (product_id + quantity + unit_price + discount)
        const seenKeys = new Set<string>();
        const itemsPayload = rawItemsPayload.filter((it) => {
          const key = `${it.product_id}|${it.quantity}|${it.unit_price}|${it.discount}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
        const { error: itemsErr } = await supabase.from("invoice_items").insert(itemsPayload);
        if (itemsErr) throw itemsErr;

        // خصم المخزون: عند الإنشاء نخصم الكميات الجديدة بالكامل،
        // وعند التعديل نطبّق الفرق فقط (delta = old - new) لتجنّب الخصم المكرر.
        const newLines = validRows.map((r) => ({ product_id: r.product_id, quantity: r.quantity }));
        if (recordExisted) {
          // حساب الفرق لكل منتج لعرضه في الإشعار
          const oldMap = new Map<string, number>();
          (oldItems || []).forEach((it: any) => {
            if (it.product_id) oldMap.set(it.product_id, (oldMap.get(it.product_id) || 0) + Number(it.quantity || 0));
          });
          const newMap = new Map<string, number>();
          validRows.forEach((r: any) => {
            if (r.product_id) newMap.set(r.product_id, (newMap.get(r.product_id) || 0) + Number(r.quantity || 0));
          });
          const allIds = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
          const nameById = new Map<string, string>();
          validRows.forEach((r: any) => { if (r.product_id) nameById.set(r.product_id, r.product_name); });
          (oldItems || []).forEach((it: any) => { if (it.product_id && !nameById.has(it.product_id)) nameById.set(it.product_id, it.product_name); });
          allIds.forEach((pid) => {
            const delta = (newMap.get(pid) || 0) - (oldMap.get(pid) || 0);
            if (delta !== 0) deductionInfo.push({ name: nameById.get(pid) || "—", delta });
          });
          await applyStockDeltaForLines(oldItems, newLines);
          didDeduct = deductionInfo.length > 0;
        } else {
          const { deductStockForInvoiceOnce } = await import("@/utils/stockDeduction");
          const result = await deductStockForInvoiceOnce(invId!, newLines);
          if (result.deducted) {
            didDeduct = true;
            deductionInfo = validRows
              .filter((r: any) => r.product_id && Number(r.quantity || 0) > 0)
              .map((r: any) => ({ name: r.product_name, delta: Number(r.quantity || 0) }));
          }
        }
        // حدِّث البصمة المرجعية لتعكس آخر حفظ ناجح للبنود
        originalItemsHashRef.current = currentItemsHash;
      }

      if (!opts.silent) {
        toast.success(editId ? "تم تحديث الفاتورة" : "تم حفظ الفاتورة");
      }
      savedRef.current = true;
      lastSavedIdRef.current = invId!;
      setSavedInvoiceId(invId!);
      // بث حدث لتحديث الشاشات المرتبطة (الترحيلات، قائمة الفواتير)
      try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
      // تحديث بيانات الدفع المحفوظة لتعكس القيم الجديدة بعد الحفظ
      setSavedTotal(Number(totals.total) || 0);
      setSavedPaid(computedPaid);
      setSavedDue(computedDue);
      setSavedCustomerId(activeCustomer ? activeCustomer.id : null);
      // إذا كنّا في وضع الإنشاء وتم الحفظ بنجاح، بدّل العنوان لوضع التعديل
      // حتى لا يُنشئ الضغط على "حفظ" مجدداً فاتورة جديدة
      if (!editId && invId) {
        const editPath = isCash ? `/invoices/cash/edit/${invId}` : `/invoices/edit/${invId}`;
        window.history.replaceState({}, "", editPath);
      }
      // تحديث dbId للصفوف المحلية لتتوافق مع الواقع في قاعدة البيانات
      if (!editId && invId) {
        // بعد الإنشاء: اقرأ البنود المحفوظة لتحديث dbId
        supabase.from("invoice_items").select("id,product_id").eq("invoice_id", invId).then(({ data: dbItems }) => {
          if (dbItems) {
            setRows((prev) => prev.map((r) => {
              const match = dbItems.find((di: any) => di.product_id === r.product_id);
              return match ? { ...r, dbId: match.id } : r;
            }));
          }
        });
      }
      if (opts.skipNavigate) {
        return true;
      }
      if (opts.andNew) {
        setRows([]);
        setCustomer(null);
        setCustomerSearch("");
        setNotes("");
        setGeneralDiscount(0);
        setShipping(0);
        setSavedInvoiceId(null);
        savedRef.current = false;
        lastSavedIdRef.current = null;
        // إعادة الرقم التسلسلي (مفصول حسب POS/Regular)
        const prefix = pos
          ? ((company as any)?.pos_invoice_prefix || "POS-")
          : (company?.invoice_prefix || "INV-");
        let lastQ2 = supabase
          .from("invoices")
          .select("invoice_number")
          .like("invoice_number", `${prefix}%`)
          .order("created_at", { ascending: false })
          .limit(1);
        if (pos) lastQ2 = lastQ2.eq("source", "pos");
        else lastQ2 = lastQ2.neq("source", "pos");
        const { data: last } = await lastQ2.maybeSingle();
        let next = 1;
        if (last?.invoice_number) {
          const m = String(last.invoice_number).match(/(\d+)$/);
          if (m) next = parseInt(m[1]) + 1;
        }
        setInvoiceNumber(`${prefix}${String(next).padStart(4, "0")}`);
        // أعد الرابط لوضع الإنشاء
        const createPath = isCash ? "/invoices/cash/new" : "/invoices/new";
        window.history.replaceState({}, "", createPath);
        if (!opts.silent) {
          toast.success("تم فتح فاتورة جديدة — جاهزة للإدخال");
        }
      }
      return true;
    } catch (e: any) {
      console.error("[InvoiceCreatePage] saveInvoice failed", e);
      const msg = e?.message || e?.error_description || e?.hint || e?.details || (typeof e === "string" ? e : "فشل الحفظ — سبب غير معروف");
      toast.error(`فشل حفظ الفاتورة: ${msg}`, { duration: 8000 });
      return false;
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }

  async function handlePrint(variant: PrintVariant = "full", noHeader: boolean = false) {
    // إذا كانت الفاتورة محفوظة → ننتقل للمعاينة الداخلية (نفس النافذة).
    if (editId) {
      const qs = new URLSearchParams();
      if (variant !== "full") qs.set("variant", variant);
      if (noHeader) qs.set("noHeader", "1");
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      // أتمتة: أي طباعة (فاتورة أو كشف جرد) → الحالة تصبح "قيد التجهيز" على الأقل
      try {
        await supabase.rpc("advance_invoice_workflow" as any, {
          _invoice_id: editId,
          _target: "preparing",
          _reason: variant === "stocktake" ? "طباعة كشف جرد" : "طباعة الفاتورة",
        });
        invalidateWorkflowAutoCache(editId);
        try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
      } catch {}
      navigate(`/preview/invoice/${editId}${suffix}`);
      return;
    }
    // غير محفوظة بعد → نُبقي النافذة المنبثقة بالبيانات الحالية في الذاكرة.
    openPrintWindow(generatePrintHTML({
      type: "invoice",
      isCash,
      date: invoiceDate,
      customer,
      items: rows.filter(r => r.product_id).map(r => ({
        product_name: r.product_name,
        quantity: r.quantity,
        unit_price: r.unit_price,
        foreign_price: r.foreign_price,
        tax_amount: 0,
        discount: r.discount,
        total: r.total,
        note: r.note || "",
        product_id: r.product_id || "",
      })),
      subtotal: totals.subtotal,
      taxTotal: totals.taxAmount,
      discountTotal: totals.itemDiscounts + generalDiscount,
      shipping,
      grandTotal: totals.total,
      notes,
      company,
      variant,
      noHeader,
    } as any));
  }


  // Re-arm the guard whenever inputs change after a save
  useEffect(() => {
    savedRef.current = false;
  }, [rows, customer, notes, internalNote, generalDiscount, shipping]);

  // Detect unsaved changes
  const isDirty = useMemo(() => {
    if (savedRef.current) return false;
    if (rows.some((r) => r.product_id)) return true;
    if (!isCash && customer) return true;
    if ((notes || "").trim().length > 0) return true;
    if ((internalNote || "").trim().length > 0) return true;
    if (Number(generalDiscount) > 0) return true;
    if (Number(shipping) > 0) return true;
    return false;
  }, [rows, customer, isCash, notes, internalNote, generalDiscount, shipping]);

  useUnsavedChangesGuard({
    isDirty,
    onSave: () => saveInvoice({ skipNavigate: true, silent: true }),
  });

  // Auto-save then run an action (open dialog / navigate) in a single click.
  const saveThen = async (action: (invId: string) => void) => {
    let id = editId;
    if (isDirty || !id) {
      const ok = await saveInvoice({ skipNavigate: true, silent: true });
      if (!ok) return;
      id = lastSavedIdRef.current || id;
      if (!id) return;
      // If we just created a new invoice, switch the URL to edit mode so subsequent saves update it.
      if (!editId) {
        window.history.replaceState({}, "", `/invoices/edit/${id}`);
      }
    }
    action(id);
  };

  // ---------- POS: اختصارات لوحة المفاتيح للكاشير ----------
  // F2 = حفظ، F4 = حفظ + طباعة، F6 = تركيز حقل العميل، F3 = تركيز حقل المنتج، F8 = حفظ + جديد
  useEffect(() => {
    if (!pos) return;
    const handler = (e: KeyboardEvent) => {
      // تجاهل لو المستخدم ضاغط Ctrl/Meta/Alt مع F-key لتفادي اختصارات النظام
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case "F2":
          e.preventDefault();
          void saveInvoice({ skipNavigate: true });
          break;
        case "F4":
          e.preventDefault();
          (async () => {
            const ok = await saveInvoice({ skipNavigate: true, silent: true });
            const id = lastSavedIdRef.current;
            if (ok && id) navigate(`/preview/invoice/${id}`);
          })();
          break;
        case "F8":
          e.preventDefault();
          void saveInvoice({ andNew: true });
          break;
        case "F3":
          e.preventDefault();
          quickProductRef.current?.focus();
          break;
        case "F6":
          e.preventDefault();
          customerInputRef.current?.focus();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);


  // ---------- Render ----------
  return (
    <div ref={pageRef} className={`neo-quote-scope${pos ? " pos-mode" : ""}`} dir="rtl" style={{ position: "relative" }}>
      <style>{`
        .neo-quote-scope { background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: 12px; height: calc(100vh - 64px); overflow: hidden; container-type: inline-size; }
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
        .neo-quote-scope .search-suggestions .price-badge { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; }
        /* Global styles for product suggestions portal (renders to document.body) */
        .search-suggestions { background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); border:1px solid hsl(var(--border)); border-radius:6px; max-height:220px; overflow-y:auto; box-shadow:0 4px 12px rgba(0,0,0,.12); font-size:12px; }
        .search-suggestions .item { padding:5px 8px; cursor:pointer; border-bottom:1px solid hsl(var(--border)); display:flex; justify-content:space-between; gap:6px; font-size:11px; font-weight:700; }
        .search-suggestions .item:hover,
        .search-suggestions .item[data-active="true"] { background: hsl(var(--accent) / 0.18); outline: 2px solid hsl(var(--primary) / 0.4); outline-offset: -2px; }
        .search-suggestions .price-badge { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); padding:1px 6px; border-radius:10px; font-size:10px; font-weight:600; white-space:nowrap; }
        .search-suggestions .suggestions-status { cursor: default; justify-content: center; font-size: 11px; color: hsl(var(--muted-foreground)); padding: 8px; font-style: italic;  font-weight: 700;}
        .search-suggestions .suggestions-status[data-status="loading"]::before { content: ""; display: inline-block; width: 10px; height: 10px; border: 2px solid hsl(var(--primary)); border-top-color: transparent; border-radius: 50%; margin-inline-end: 6px; animation: sugg-spin 0.7s linear infinite; vertical-align: middle; }
        .search-suggestions .suggestions-status[data-status="empty"] { color: hsl(var(--destructive)); }
        @keyframes sugg-spin { to { transform: rotate(360deg); } }
        .neo-quote-scope .item_header { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
        .neo-quote-scope.pos-mode .item_header,
        .neo-quote-scope.pos-mode .item_header th,
        .neo-quote-scope.pos-mode .items-scroll thead th { background: hsl(var(--destructive)) !important; color: hsl(var(--destructive-foreground)) !important; }
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
        .neo-quote-scope .btn-warning { background: hsl(38 92% 50%); color:#fff; }
        .neo-quote-scope .btn-info { background: hsl(199 89% 48%); color:#fff; }
        .neo-quote-scope .btn-ghost { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .neo-quote-scope .btn-sm { padding: 2px 6px; font-size:10px; height: 22px; }
        .neo-quote-scope .customer-suggestions { position:absolute; top:100%; left:0; right:0; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); border:2px solid hsl(var(--primary)); border-radius:6px; max-height:220px; overflow-y:auto; z-index:1000; box-shadow:0 8px 25px rgba(0,0,0,.15); margin-top:2px; }
        .neo-quote-scope .customer-item { padding:6px 8px; border-bottom:1px solid hsl(var(--border)); cursor:pointer; font-size:11px; }
        .neo-quote-scope label { font-size:10px; color: hsl(var(--muted-foreground)); margin-bottom:2px; display:block; }
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
        @media (max-width: 767px) {
          .neo-quote-scope { height: auto !important; min-height: calc(100vh - 64px); overflow: auto !important; }
          .neo-quote-scope .quote-layout { display: flex !important; flex-direction: column !important; height: auto !important; min-height: calc(100vh - 80px); }
          .neo-quote-scope .quote-layout > aside { width: 100% !important; max-width: 100% !important; min-height: 280px; }
          .neo-quote-scope .form-column { min-height: 70vh; height: auto; }
          /* ارتفاع ثابت لجدول البنود على الجوال حتى تظهر صفوف TableFiller الفارغة دائماً قبل الأزرار */
          .neo-quote-scope .items-table-wrap { height: 55vh !important; min-height: 360px !important; max-height: 60vh !important; flex: 0 0 auto !important; }
          .neo-quote-scope .items-scroll { height: 100% !important; min-height: 0 !important; max-height: none !important; }
        }
        /* .items-scroll layout موحّد في ItemsScroll */
      `}</style>

      <div className="quote-layout" style={{ padding: 3, height: "100%" }}>
        {/* ============ المحتوى الرئيسي ============ */}
        <div className="form-column">
          {/* ============ Header bar ============ */}
          <div className="header-bar" style={{ flexShrink: 0, height: "auto" }}>
            {pos ? (
              <div className="field" style={{ position: "relative", flex: `0 0 ${CUSTOMER_FIELD_BASE + (custExtras[0] || 0)}px`, minWidth: 0 }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span>اسم العميل (اختياري)</span>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    title="تاريخ الفاتورة"
                    style={{ fontSize: 10, height: 18, padding: "0 4px", border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--background))", color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                </label>
                <input
                  ref={customerInputRef}
                  type="text"
                  className="form-control customer-name-input"
                  placeholder="عميل نقدي"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickProductRef.current?.focus(); } }}
                  style={{ fontWeight: 600, width: "100%" }}
                />
              </div>
            ) : (
              <div className="field product-search-container" style={{ position: "relative", flex: `0 0 ${CUSTOMER_FIELD_BASE + (custExtras[0] || 0)}px`, minWidth: 0 }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span>{isCash ? "عميل (اختياري)" : "العميل"}</span>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    title="تاريخ الفاتورة"
                    style={{ fontSize: 10, height: 18, padding: "0 4px", border: "1px solid hsl(var(--border))", borderRadius: 3, background: "hsl(var(--background))", color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                </label>
                {!colsLocked && <ExpandFieldButton currentExtra={custExtras[0] || 0} onDrag={(v) => custSetExtra(0, v)} onReset={() => custReset(0)} title="اسحب لتغيير عرض حقل العميل · نقرة مزدوجة لإعادة الضبط" />}
                <input
                  ref={customerInputRef}
                  type="text"
                  className="form-control customer-name-input"
                  placeholder="اسم العميل أو رقم الهاتف"
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerSugg(true); if (customer) setCustomer(null); }}
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
                      <div key={c.id} className="customer-item" data-sugg-item data-active={i === 0 ? "true" : "false"} onMouseDown={() => pickCustomer(c)}>
                        <strong>{c.name}</strong>
                        <span style={{ color: "hsl(var(--muted-foreground))", marginRight: 8 }}>{c.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add new customer button — hidden in POS mode */}
            {!pos && (
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
            )}




            <div className="field" style={{ width: HEADER_FIELD_BASES[1] + (hdrExtras[1] || 0) }}>
              <label>المستودع</label>
              <select className="form-control" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ minWidth: 0, width: "100%" }}>
                <option value="">— اختر مستودع —</option>
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
                    {customer.phone && (customerBalances?.debt || 0) + (customerBalances?.credit || 0) > 0 && (
                      <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 9, flexShrink: 0 }}>·</span>
                    )}
                    {/* عليه = عميل مدين لنا */}
                    {customerBalances && customerBalances.debt > 0 && (
                      <span style={{ color: "hsl(var(--destructive))", fontWeight: 700, fontSize: 11, flexShrink: 0, background: "hsl(var(--destructive)/0.08)", borderRadius: 3, padding: "0 3px" }}>
                        عليه {customerBalances.debt.toLocaleString()}
                      </span>
                    )}
                    {/* له = نحن مدينون له */}
                    {customerBalances && customerBalances.credit > 0 && (
                      <span style={{ color: "hsl(142 70% 35%)", fontWeight: 700, fontSize: 11, flexShrink: 0, background: "hsl(142 70% 35% / 0.08)", borderRadius: 3, padding: "0 3px" }}>
                        له {customerBalances.credit.toLocaleString()}
                      </span>
                    )}
                    {(!customerBalances || (customerBalances.debt === 0 && customerBalances.credit === 0)) && !customer.phone && (
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
          <div className="quick-add-row" style={{ marginTop: 6, flexShrink: 0, gridTemplateColumns: quickGrid(QUICK_BASE_INVOICE) }}>
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
                data-quick-search="invoice"
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
              <SuggestionsPortal anchorSelector='[data-quick-search="invoice"]' open={quickRow.showSuggestions} width={suggWidth}>
                <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                  <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                  {(() => {
                    const matches = productMatches(quickRow.productSearch);
                    if (productsLoading) return <div className="item suggestions-status" data-status="loading">جارٍ تحميل المنتجات…</div>;
                    if (!quickRow.productSearch.trim()) return <div className="item suggestions-status" data-status="hint">اكتب للبحث ({products.length} منتج)</div>;
                    if (matches.length === 0) return <div className="item suggestions-status" data-status="empty">لا توجد نتائج</div>;
                    return matches.map((p, i) => (
                      <div key={p.id} className="item" data-sugg-item data-active={i === 0 ? "true" : "false"} onMouseDown={() => pickProductIntoQuick(p)}>
                        <span>{p.name}</span>
                        <span style={{ marginRight: 4, padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.12)", color: Number(p.stock_quantity) > 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)", border: `1px solid ${Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.35)" : "hsl(0 84% 60% / 0.3)"}`, flexShrink: 0 }}>
                          {Number(p.stock_quantity) > 0 ? Number(p.stock_quantity).toLocaleString() : "0"}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </SuggestionsPortal>
            </div>

            <div className="quick-add-field">
              <input ref={quickQtyRef} data-nav-col="quantity" type="number" className="form-control text-center" placeholder="الكمية"
                value={quickRow.quantity || ""}
                onChange={(e) => setQuickRow((r) => { const q = Number(e.target.value) || 0; const u = { ...r, quantity: q }; u.total = calcTotal(u); return u; })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickRowToTable(); } }} />
              <ExpandFieldButton currentExtra={quickExtras[1] || 0} onDrag={(v) => quickSetExtra(1, v)} onReset={() => quickReset(1)} />
            </div>

            <div className="quick-add-field">
              <input step="any" data-nav-col="unit_price" type="number" className="form-control text-center" placeholder="المحلي"
                value={quickRow.unit_price || ""}
                onChange={(e) => setQuickRow((r) => { const up = Number(e.target.value) || 0; const u = { ...r, unit_price: up }; u.total = calcTotal(u); return u; })} />
              <ExpandFieldButton currentExtra={quickExtras[2] || 0} onDrag={(v) => quickSetExtra(2, v)} onReset={() => quickReset(2)} />
            </div>

            <div className="quick-add-field">
              <input step="any" data-nav-col="foreign_price" type="number" className="form-control text-center" placeholder="$ السعر الأجنبي"
                value={quickRow.foreign_price || ""}
                onChange={(e) => setQuickRow((r) => { const fp = Number(e.target.value) || 0; const u = { ...r, foreign_price: fp, unit_price: fp * r.exchange_rate }; u.total = calcTotal(u); return u; })} />
              <ExpandFieldButton currentExtra={quickExtras[3] || 0} onDrag={(v) => quickSetExtra(3, v)} onReset={() => quickReset(3)} />
            </div>

            <div className="quick-add-field">
              <input ref={quickRateRef} data-nav-col="exchange_rate" type="number" step="0.01" className="form-control text-center" placeholder="معدل التحويل"
                value={quickRow.exchange_rate}
                onChange={(e) => { const er = Number(e.target.value) || 1; setQuickRow((r) => { const u = { ...r, exchange_rate: er, unit_price: r.foreign_price * er }; u.total = calcTotal(u); return u; }); setRows((prev) => prev.map((row) => { const u = { ...row, exchange_rate: er, unit_price: row.foreign_price * er }; u.total = calcTotal(u); return u; })); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickRowToTable(); } }} />
              <ExpandFieldButton currentExtra={quickExtras[4] || 0} onDrag={(v) => quickSetExtra(4, v)} onReset={() => quickReset(4)} />
            </div>

            <button type="button" className="btn btn-primary btn-sm" onClick={addQuickRowToTable}>+ إضافة</button>
          </div>

          {/* ============ Bulk actions toolbar ============ */}
          {rows.some((r) => r.selected) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "6px 10px", background: "#fff3cd",
              border: "1px solid #ffeeba", borderRadius: 6,
              marginBottom: 6, flexShrink: 0,
            }}>
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
          <div className="items-table-wrap" style={{ background: "hsl(var(--card))", borderRadius: 8, overflow: "hidden", border: "1px solid hsl(var(--border))", flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <ItemsScroll ref={itemsScrollRef}>
              <table className="excel-table" style={{ width: "100%", tableLayout: "fixed" }} {...tableProps}>
                <colgroup>
                  {colWidths.map((w, i) => (
                    <col key={i} style={w != null ? { width: w } : (colMinWidths[i] != null ? { minWidth: colMinWidths[i]! } : undefined)} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="item_header">
                    <th style={{ position: "relative" }}>
                      <input type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => r.selected)}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        title="تحديد الكل" />
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
                      tableId: "invoice-items",
                      cols: NAV_COLS,
                      getRowCount: () => visibleRows.length,
                    });
                    return visibleRows.map((r, idx, arr) => {
                    return (
                    <React.Fragment key={r.uid}>
                      <tr className={`excel-row ${r.selected ? "row-selected-danger" : ""} ${isSpacePending(r.uid) ? "row-pending-delete" : ""}`} onKeyDown={(e) => handleSpaceDelete(r.uid, e)}>
                        <td className="text-center">
                          <input type="checkbox" checked={r.selected}
                            onChange={(e) => updateRow(r.uid, { selected: e.target.checked })} />
                        </td>
                        <td>
                          <div className="product-search-container">
                            <input type="text" className="form-control" placeholder="اكتب اسم المنتج..."
                              data-row-search={r.uid}
                              data-nav-table="invoice-items"
                              data-nav-row={idx}
                              data-nav-col="product"
                              value={r.productSearch}
                              onChange={(e) => updateRow(r.uid, { productSearch: e.target.value, showSuggestions: true, product_id: null })}
                              
                              onBlur={() => setTimeout(() => updateRow(r.uid, { showSuggestions: false }), 150)}
                              onKeyDown={(e) => handleNav(idx, "product", e, { skipVertical: !!r.showSuggestions })} />
                            <SuggestionsPortal anchorSelector={`[data-row-search="${r.uid}"]`} open={r.showSuggestions} width={suggWidth}>
                              <div className="search-suggestions" style={{ position: "relative", top: "auto", left: "auto", right: "auto" }}>
                                <SuggestionsResizeHandle onMouseDown={startSuggDrag} />
                                {r.showSuggestions && (() => {
                                  const matches = productMatches(r.productSearch, r.uid);
                                  if (productsLoading) return <div className="item suggestions-status" data-status="loading">جارٍ تحميل المنتجات…</div>;
                                  if (!r.productSearch.trim()) return <div className="item suggestions-status" data-status="hint">اكتب للبحث ({products.length} منتج)</div>;
                                  if (matches.length === 0) return <div className="item suggestions-status" data-status="empty">لا توجد نتائج</div>;
                                  return matches.map((p, i) => (
                                    <div key={p.id} className="item" data-sugg-item data-active={i === 0 ? "true" : "false"} onMouseDown={() => pickProductIntoRow(r.uid, p)}>
                                      <span>{p.name}</span>
                                      <span style={{ marginRight: 4, padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.15)" : "hsl(0 84% 60% / 0.12)", color: Number(p.stock_quantity) > 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)", border: `1px solid ${Number(p.stock_quantity) > 0 ? "hsl(142 71% 45% / 0.35)" : "hsl(0 84% 60% / 0.3)"}`, flexShrink: 0 }}>
                                        {Number(p.stock_quantity) > 0 ? Number(p.stock_quantity).toLocaleString() : "0"}
                                      </span>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </SuggestionsPortal>
                          </div>
                        </td>
                        <td>
                          <input type="number" className="form-control text-center" value={r.quantity}
                            data-nav-table="invoice-items" data-nav-row={idx} data-nav-col="quantity"
                            onKeyDown={(e) => handleNav(idx, "quantity", e)}
                            onChange={(e) => updateRow(r.uid, { quantity: Number(e.target.value) || 0 })} />
                        </td>
                        <td>
                          <input step="any" type="number" className="form-control text-center" value={r.unit_price || ""}
                            data-nav-table="invoice-items" data-nav-row={idx} data-nav-col="unit_price"
                            onKeyDown={(e) => handleNav(idx, "unit_price", e)}
                            onChange={(e) => {
                              setRows((prev) => prev.map((row) => {
                                if (row.uid !== r.uid) return row;
                                const up = Number(e.target.value) || 0;
                                const merged = { ...row, unit_price: up };
                                merged.total = calcTotal(merged);
                                return merged;
                              }));
                            }}
                            style={{ background: "#fff8e6" }} />
                        </td>
                        <td>
                          <input step="any" type="number" className="form-control text-center" value={r.foreign_price || ""}
                            data-nav-table="invoice-items" data-nav-row={idx} data-nav-col="foreign_price"
                            onKeyDown={(e) => handleNav(idx, "foreign_price", e)}
                            onChange={(e) => updateRow(r.uid, { foreign_price: Number(e.target.value) || 0 })} />
                        </td>
                        <td className="text-center" style={{ fontWeight: 700, color: "#28a745", outline: "none" }}
                            tabIndex={0}
                            data-nav-table="invoice-items" data-nav-row={idx} data-nav-col="total"
                            onKeyDown={(e) => handleNav(idx, "total", e)}>
                          {r.total.toLocaleString()}
                        </td>
                        <td className="text-center">
                          <button type="button"
                            className="btn btn-sm"
                            onClick={() => setItemNoteEditing({ uid: r.uid, productName: r.product_name, value: r.note || "" })}
                            title={r.note || "إضافة ملاحظة"}
                            style={{
                              padding: "2px 8px",
                              background: r.note ? "#2563eb" : "#ffffff",
                              color: r.note ? "#ffffff" : "#475569",
                              border: r.note ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
                              borderRadius: 4,
                            }}>
                            📝
                          </button>
                        </td>
                        <td className="text-center">
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRow(r.uid)}>×</button>
                        </td>
                      </tr>
                      {r.note && (
                        <tr className="excel-row" style={{ background: "#eff6ff" }}>
                          <td colSpan={8} style={{ padding: "4px 12px", fontSize: 11, color: "#1d4ed8", whiteSpace: "pre-wrap" }}>
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
          <ToolbarCustomizationProvider storageKey={isEdit ? "invoice-edit" : "invoice-create"}>
          <div dir="rtl" style={{ marginTop: 6, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <FreePositionToolbar
              screenKey={isEdit ? "invoice-edit-toolbar" : "invoice-create-toolbar"}
              withCustomizeButtons
              zoom={{ value: itemsZoom, inc: itemsZoomInc, dec: itemsZoomDec }}
              items={[
                // === Group 0: Summary chips (قابلة للنقل والتسمية والإخفاء) ===
                {
                  id: "sum-total",
                  group: "0-summary",
                  useHandle: true,
                  defaultLabel: "المجموع",
                  node: (
                    <SummaryChip
                      screenKey={isEdit ? "invoice-edit-toolbar" : "invoice-create-toolbar"}
                      id="sum-total"
                      defaultLabel="المجموع"
                      value={`${totals.total.toLocaleString()} ${currencyCode}`}
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
                // === Group 1: Primary actions (save / edit / payment) ===
                {
                  id: "save",
                  group: "1-primary",
                  node: (
                    <button className="btn btn-success btn-sm" onClick={() => saveInvoice()} disabled={saving}>
                      {saving ? "جاري الحفظ..." : (isEdit ? "تحديث الفاتورة" : "حفظ الفاتورة")}
                    </button>
                  ),
                },
                ...(!editId ? [{
                  id: "save-and-new",
                  group: "1-primary",
                  node: (
                    <button className="btn btn-info btn-sm" onClick={() => saveInvoice({ andNew: true })} disabled={saving}>
                      + حفظ وجديد
                    </button>
                  ),
                }] : []),
                ...(editId ? [{
                  id: "edit-save",
                  group: "1-primary",
                  node: (
                    <button onClick={() => saveInvoice({ andNew: true })} disabled={saving} title="حفظ التعديلات وفتح فاتورة جديدة" style={btnStyle("#f97316")}>
                      <Plus size={14} /> حفظ وجديد
                    </button>
                  ),
                }] : []),
                ...(!pos ? [{
                  id: "record-payment",
                  group: "1-primary",
                  node: (
                    <button
                      type="button"
                      onClick={openPaymentDialog}
                      disabled={!editId}
                      title={editId ? "تسجيل دفعة" : "احفظ الفاتورة أولاً"}
                      style={{ ...btnStyle("#0891b2"), opacity: editId ? 1 : 0.55, cursor: editId ? "pointer" : "not-allowed" }}
                    >
                      <Wallet size={14} /> تسجيل دفعة
                    </button>
                  ),
                }] : []),
                ...(pos ? [{
                  id: "manage-cash",
                  group: "1-primary",
                  node: (
                    <button
                      type="button"
                      onClick={() => navigate("/invoices/cash/list")}
                      title="إدارة فواتير الكاش"
                      style={btnStyle("#0ea5e9")}
                    >
                      إدارة الكاش
                    </button>
                  ),
                }] : []),

                // === Group 2: Files & attachments ===
                ...([
                {
                  id: "packaging",
                  group: "2-files",
                  node: (
                    <button
                      onClick={() => saveThen(() => setPackagingDialogOpen(true))}
                      title="إضافة تغليف"
                      style={btnStyle("#f59e0b")}
                    >
                      <Package size={14} />
                    </button>
                  ),
                },
                {
                  id: "transport",
                  group: "2-files",
                  node: (
                    <button
                      onClick={() => saveThen(() => setTransportDialogOpen(true))}
                      title="إضافة ترحيل" style={btnStyle("#16a34a")}>
                      <Truck size={14} />
                    </button>
                  ),
                },
                // (تم حذف زرّي "تقرير الترحيل" و"تقرير التغليف" بناءً على طلب المالك)
                ...(!pos ? [{
                  id: "dispatch-page",
                  group: "2-files",
                  node: (
                    <button
                      onClick={() => navigate("/dispatch")}
                      title="صفحة إدارة الترحيلات الكاملة"
                      style={btnStyle("#7c3aed")}
                    >
                      <Truck size={14} /> الترحيلات
                    </button>
                  ),
                }] : []),
                ]),
                {
                  id: "attachments",
                  group: "2-files",
                  node: (
                    <button
                      onClick={() => saveThen(() => setAttachmentsDialogOpen(true))}
                      title="المستندات (إيصال الدفع، الجرد، التفاصيل)"
                      style={btnStyle("#7c3aed")}>
                      <FileText size={14} /> المستندات
                    </button>
                  ),
                },
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

                // === Group 3: Print & sharing ===
                {
                  id: "print",
                  group: "3-share",
                  node: (
                    <button type="button" onClick={() => handlePrint("full", false)} style={btnStyle("#ef4444")} title="طباعة">
                      <Printer size={14} /> طباعة
                    </button>
                  ),
                },
                {
                  id: "stocktake",
                  group: "3-share",
                  node: (
                    <button type="button" onClick={() => handlePrint("stocktake", false)} style={btnStyle("#f97316")} title="كشف جرد">
                      <FileText size={14} /> كشف جرد
                    </button>
                  ),
                },
                {
                  id: "whatsapp",
                  group: "3-share",
                  node: (
                    <button
                      onClick={async () => {
                        if (!editId) { toast.error("احفظ الفاتورة أولاً لإرسال رابطها"); return; }
                        // POS: قد لا يوجد عميل برقم هاتف — نفتح واتساب بدون مرسل
                        // ليختار المستخدم جهة الاتصال يدوياً.
                        if (!pos && !customer?.phone) {
                          toast.error("لا يوجد رقم هاتف للعميل");
                          return;
                        }
                        const { shareDocumentViaWhatsApp } = await import("@/utils/shareDocumentWhatsApp");
                        await shareDocumentViaWhatsApp({
                          docType: "invoice",
                          docId: editId,
                          phone: pickCustomerWhatsApp(customer),
                          customerName: customer?.name || (pos ? (walkInName?.trim() || "عميل نقدي") : null),
                          docNumber: invoiceNumber,
                          total: totals.total,
                          currency: currencyCode,
                          docLabel: pos ? "فاتورة كاش" : "فاتورة",
                        });
                      }}
                      title="إرسال واتساب مع رابط الفاتورة" style={btnStyle("#10b981")}>
                      <MessageCircle size={14} /> واتساب
                    </button>
                  ),
                },

                // === Group 4: Status & navigation ===
                {
                  id: "workflow-status",
                  group: "4-meta",
                  node: (
                    <StatusButton
                      statuses={WORKFLOW_STATUS_OPTIONS}
                      current={workflowStatus}
                      disabled={!editId}
                      disabledTitle="احفظ الفاتورة أولاً"
                      onChange={async (v) => {
                        if (!editId) return;
                        const prev = workflowStatus;
                        if (v === prev) return;
                        const rankOf = (s: string) => WORKFLOW_STATUS_OPTIONS.findIndex(x => x.value === s);
                        if (rankOf(v) < rankOf(prev)) {
                          toast.error("لا يمكن تخفيض حالة التجهيز");
                          return;
                        }
                        setWorkflowStatus(v);
                        const { error } = await supabase.rpc("advance_invoice_workflow" as any, {
                          _invoice_id: editId,
                          _target: v,
                          _reason: `تغيير يدوي للحالة من شاشة الفاتورة: ${prev} → ${v}`,
                        });
                        if (error) { setWorkflowStatus(prev); toast.error(error.message); return; }
                        // Stock deduction: only when leaving "new" for the first time
                        if (prev === "new" && v !== "new") {
                          try {
                            const { data: items } = await supabase
                              .from("invoice_items")
                              .select("product_id, product_name, quantity")
                              .eq("invoice_id", editId);
                            const { deductStockForInvoiceOnce } = await import("@/utils/stockDeduction");
                            const result = await deductStockForInvoiceOnce(
                              editId,
                              (items || []).map((it: any) => ({ product_id: it.product_id, quantity: it.quantity })),
                            );
                            if (result.deducted) {
                              const lines = (items || [])
                                .filter((it: any) => it.product_id && Number(it.quantity || 0) > 0)
                                .slice(0, 8)
                                .map((it: any) => `• ${it.product_name}: -${it.quantity} خصم`)
                                .join("\n");
                              const more = (items || []).length > 8 ? `\n… و${(items || []).length - 8} منتج آخر` : "";
                              if (lines) {
                                toast.success("تم خصم المخزون", {
                                  description: lines + more,
                                  duration: 6000,
                                });
                              }
                            }
                          } catch (stockErr) { console.error("[InvoiceCreatePage] stock deduction failed", stockErr); }
                        }
                        invalidateWorkflowAutoCache(editId);
                        try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
                        toast.success("تم تحديث الحالة");
                      }}
                    />
                  ),
                },
                // Financial invoice status button removed — invoices now use workflow_status only.
                {
                  id: "clear",
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
                      title="مسح بيانات الفاتورة الحالية بالكامل"
                    >
                      مسح
                    </button>
                  ) : null,
                },
              ]}
            />
          </div>
          </ToolbarCustomizationProvider>
        </div>

        <PanelResizer storageKey="panels:invoice-create:sidebar" scopeSelector=".neo-quote-scope" />
        <aside className="recent-invoices-scope" style={{ alignSelf: "stretch", height: "100%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {pos ? <RecentItemsSidebar type="invoices" compact sourceFilter="pos" /> : <RecentItemsSidebar type="invoices" compact />}
          <RowResizer storageKey="rows:invoice-create:recent-density" scopeSelector=".recent-invoices-scope" cssVar="recent-density" mode="scale" defaultHeight={1.0} min={0.6} max={2.5} />
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
            placeholder="ملاحظات تظهر في الفاتورة المطبوعة..."
            rows={6}
            className="resize-none"
          />
          <DialogFooter className="gap-2">
            {notes && (
              <Button variant="destructive" onClick={() => { setNotes(""); setNotesDraft(""); setNotesDialogOpen(false); }}>
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

      {/* ============ Record Payment Dialog ============ */}
      <Dialog open={paymentDialogOpen} onOpenChange={(o) => !savingPayment && setPaymentDialogOpen(o)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded border border-border p-2 bg-muted/30">
                <div className="text-[11px] text-muted-foreground">الإجمالي</div>
                <div className="font-semibold">{Number(savedTotal || 0).toLocaleString()}</div>
              </div>
              <div className="rounded border border-border p-2 bg-muted/30">
                <div className="text-[11px] text-muted-foreground">المدفوع</div>
                <div className="font-semibold">{Number(savedPaid || 0).toLocaleString()}</div>
              </div>
              <div className="rounded border border-border p-2 bg-muted/30">
                <div className="text-[11px] text-muted-foreground">المتبقي</div>
                <div className="font-semibold">{Number(savedDue || 0).toLocaleString()}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">مبلغ الدفعة</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control w-full"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" title="يُخصم من المتبقي ويُسجَّل ضمن ملاحظة الدفعة">
                  خصم على الدفعة
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control w-full"
                  value={payDiscount}
                  onChange={(e) => setPayDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">طريقة الدفع</label>
                <select className="form-control w-full" value={payMethod} onChange={(e) => { setPayMethod(e.target.value); setPayAccount(""); setPayRef(""); }}>
                  <option value="cash">نقدي</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="card">بطاقة</option>
                  <option value="cheque">شيك</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  {isBankMethod(payMethod) ? "الحساب البنكي المستلِم *" : "الحساب المستلِم"}
                </label>
                <select className="form-control w-full" value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                  <option value="">— بدون —</option>
                  {filterAccountsForPayment(accounts as any[], payMethod).map((a: any) => {
                    const flagged = isBankMethod(payMethod) && !isAllowedBank(a);
                    return (
                      <option key={a.id} value={a.id} disabled={flagged}>
                        {a.name}{a.bank_name ? ` (${a.bank_name})` : ""}{flagged ? " — بنك غير معتمد" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            {isBankMethod(payMethod) && (
              <div>
                <label className="block text-xs font-medium mb-1">رقم العملية / الإشعار البنكي (اختياري)</label>
                <input
                  type="text"
                  className="form-control w-full"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="مثال: 12345678"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">التاريخ</label>
              <input type="date" className="form-control w-full" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">ملاحظة</label>
              <Textarea rows={2} value={payNote} onChange={(e) => setPayNote(e.target.value)} className="resize-none" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} disabled={savingPayment}>
              إلغاء
            </Button>
            <Button onClick={handleRecordPayment} disabled={savingPayment} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              {savingPayment ? "جاري الحفظ..." : "حفظ الدفعة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Clear/Delete Confirmation ============ */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={(o) => !clearing && setClearConfirmOpen(o)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "hsl(var(--destructive))" }}>
              مسح الفاتورة الحالية
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editId
                ? `هل تريد حذف الفاتورة ${invoiceNumber || ""} بالكامل من قاعدة البيانات؟ سيتم إرجاع الكميات إلى المخزون. لا يمكن التراجع عن هذا الإجراء.`
                : "هل تريد مسح جميع بيانات الفاتورة الحالية؟"}
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
                  const targetId = editId || savedInvoiceId;
                  if (targetId) {
                    // حذف موحّد عبر deleteInvoiceWithStockRestore:
                    // يُرجع المخزون فقط إن كانت الفاتورة مُخصومة (stock_deduction_id موجود)،
                    // ثم يحذف كل التوابع والفاتورة. أي فشل يوقف العملية.
                    let restoredStock = false;
                    try {
                      const { deleteInvoiceWithStockRestore } = await import("@/utils/deleteInvoice");
                      const res = await deleteInvoiceWithStockRestore(targetId);
                      restoredStock = res.restoredStock;
                    } catch (delErr: any) {
                      console.error("[InvoiceCreatePage] delete failed", delErr);
                      toast.error(`فشل الحذف: ${delErr?.message || "خطأ غير معروف"}`, { duration: 8000 });
                      setClearing(false);
                      return;
                    }

                    toast.success(
                      (invoiceNumber
                        ? `تم حذف الفاتورة «${invoiceNumber}» بالكامل`
                        : "تم حذف الفاتورة بالكامل")
                        + (restoredStock ? " وإرجاع الكميات إلى المخزون" : "")
                        + " — جارٍ فتح فاتورة جديدة",
                      { duration: 5000 }
                    );

                    queryClient.setQueriesData<any>(
                      { predicate: (q) => {
                        const key = q.queryKey[0];
                        return key === "invoices-with-customers" || key === "invoices";
                      }},
                      (old: any) => {
                        if (!Array.isArray(old)) return old;
                        return old.filter((row: any) => row.id !== targetId);
                      }
                    );
                    queryClient.invalidateQueries({ queryKey: ["invoices-with-customers"] });
                    queryClient.invalidateQueries({ queryKey: ["invoices"] });

                    setClearConfirmOpen(false);
                    setClearing(false);
                    navigate("/invoices/create", { replace: true });
                    return;
                  }

                  // الحالة: لم يتم الحفظ بعد — مسح الحقول فقط
                  setRows([]);
                  setCustomer(null);
                  setCustomerSearch("");
                  setNotes("");
                  setInternalNote("");
                  setGeneralDiscount(0);
                  setShipping(0);
                  setInvoiceDate(new Date().toISOString().slice(0, 10));
                  setInvoiceNumber("");
                  setQuickRow(newRow(defaultRate));
                  setTableSearch("");
                  setWorkflowStatus("new");
                  toast.success("تم مسح بيانات الفاتورة — سيتم استخدام رقم جديد عند الحفظ");
                  setClearConfirmOpen(false);
                } catch (err: any) {
                  console.error("[InvoiceCreatePage] clear failed", err);
                  toast.error(`فشل المسح: ${err?.message || "خطأ غير معروف"}`, { duration: 8000 });
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

      

      {(() => {
        const effectiveId = editId || savedInvoiceId;
        if (!effectiveId) return null;
        return (
          <>
            <PackagingDialog
              open={packagingDialogOpen}
              onOpenChange={setPackagingDialogOpen}
              parentType="invoice"
              parentId={effectiveId}
            />
            <TransportDialog
              open={transportDialogOpen}
              onOpenChange={setTransportDialogOpen}
              parentType="invoice"
              parentId={effectiveId}
              customerId={customer?.id || null}
              showAllReady={false}
            />
            <InvoiceAttachmentsDialog
              invoiceId={effectiveId}
              open={attachmentsDialogOpen}
              onClose={() => setAttachmentsDialogOpen(false)}
              onWorkflowAdvanced={async () => {
                if (!effectiveId) return;
                const { data: inv } = await supabase
                  .from("invoices")
                  .select("workflow_status,status,paid_amount,due_amount,total")
                  .eq("id", effectiveId)
                  .maybeSingle();
                if (inv) {
                  setWorkflowStatus((inv as any).workflow_status || "new");
                  setInvoiceStatus((inv as any).status || "pending");
                  setSavedPaid(Number((inv as any).paid_amount) || 0);
                  setSavedDue(Number((inv as any).due_amount) || 0);
                  setSavedTotal(Number((inv as any).total) || 0);
                }
              }}
            />
          </>
        );
      })()}

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
          const item: InvRow = {
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
              const item: InvRow = {
                ...base,
                uid: crypto.randomUUID(),
                product_id: p.id,
                product_name: p.name,
                productSearch: p.name,
                foreign_price: fp,
                unit_price: fp * base.exchange_rate,
                quantity: line.qty || 1,
                unit: (p as any).unit || null,
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
        pageKey="invoice-create"
        onSaveDefault={() => { saveColsAsDefault(); toast.success("تم تعيين عرض الأعمدة كافتراضي"); }}
        onReset={() => { resetColWidths(); toast.success("تم إعادة عرض الأعمدة"); }}
        onSave={() => { try { setColsLocked(true); toast.success(COLS_TOAST_SAVED); } catch { toast.error(COLS_TOAST_SAVE_FAILED); } }}
      />
    </div>
  );
}
