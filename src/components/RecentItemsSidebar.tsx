import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, FileText, StickyNote, Search, X, Lock, Unlock, Settings2, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { WORKFLOW_STATUSES, getWorkflowStatus, type WorkflowStatus } from "@/components/invoice/WorkflowStatusBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useInvoicesWithCustomers, useQuotesWithCustomers } from "@/hooks/useData";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useColumnWidths, ColumnResizeHandle } from "@/hooks/useColumnWidths";
import { useFormFactorScopedLegacyKey } from "@/lib/formFactorKey";

const LIMIT_OPTIONS = [10, 25, 50, 75, 100];
const RECENT_FETCH_WINDOW = 500;

// Invoices use workflow_status only (4 states). This map is kept as a fallback for
// any code path that still reads invoice.status, but UI now relies on WORKFLOW_STATUSES.
const invoiceStatusMap: Record<string, { label: string; className: string }> = {
  new:        { label: "جديد",                 className: "bg-gray-300 text-gray-800" },
  preparing:  { label: "قيد التجهيز",          className: "bg-yellow-400 text-gray-900" },
  in_transit: { label: "في الطريق للترحيلات", className: "bg-purple-500 text-white" },
  done:       { label: "تم",                   className: "bg-green-500 text-white" },
};

// Quotes: 4 statuses (draft, sent, accepted, rejected).
const quoteStatusMap: Record<string, { label: string; className: string }> = {
  draft:    { label: "عرض سعر", className: "bg-blue-500 text-white" },
  sent:     { label: "مرسل",  className: "bg-amber-500 text-white" },
  accepted: { label: "مقبول", className: "bg-green-600 text-white" },
  rejected: { label: "مرفوض", className: "bg-red-600 text-white" },
};

// purchase_orders.status IN ('pending','received','cancelled')
const purchaseStatusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "معلق", className: "bg-orange-500 text-white" },
  received: { label: "مستلم", className: "bg-green-500 text-white" },
  cancelled: { label: "ملغي", className: "bg-gray-400 text-white" },
};

function usePurchaseOrdersWithSuppliers(limit?: number) {
  return useQuery({
    queryKey: ["purchase-orders-with-suppliers", limit],
    queryFn: async () => {
      let q = supabase
        .from("purchase_orders")
        .select("*, suppliers(name, phone, balance)")
        .order("created_at", { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

// stock_returns.status IN ('pending','approved','rejected')
const returnStatusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "معلق", className: "bg-orange-500 text-white" },
  approved: { label: "موافق عليه", className: "bg-green-500 text-white" },
  rejected: { label: "مرفوض", className: "bg-red-500 text-white" },
};

function useStockReturnsWithCustomers(limit?: number) {
  return useQuery({
    queryKey: ["stock-returns-with-customers", limit],
    queryFn: async () => {
      let q = supabase
        .from("stock_returns")
        .select("*, customers(name, phone, balance)")
        .order("created_at", { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

interface RecentItemsSidebarProps {
  type: "invoices" | "quotes" | "purchases" | "returns";
  compact?: boolean;
  sideOnly?: boolean;
}

function RecentItemsSidebarImpl({ type, compact = false, sideOnly = false }: RecentItemsSidebarProps) {
  const limitStorageKey = useFormFactorScopedLegacyKey(`recent-sidebar:limit:${type}:v1`);
  const [limit, setLimitState] = useState<number>(() => {
    if (typeof window === "undefined") return 50;
    try {
      const raw = localStorage.getItem(limitStorageKey);
      const n = raw ? Number(raw) : NaN;
      return LIMIT_OPTIONS.includes(n) ? n : 50;
    } catch { return 50; }
  });
  const setLimit = (n: number) => {
    setLimitState(n);
    try { localStorage.setItem(limitStorageKey, String(n)); } catch { /* noop */ }
  };
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [payFilter, setPayFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; id: string | null; current: string }>({
    open: false,
    id: null,
    current: "",
  });
  const [noteValue, setNoteValue] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ===== Resizable columns (per-type, persisted) =====
  // Order of columns in tbody:
  //   invoices: [العميل, حالة الدفع, التجهيز, التاريخ, المبلغ, ملاحظة]   (6)
  //   others:   [العميل/المورد, الحالة, التاريخ, المبلغ, ملاحظة]          (5)
  const isInvoicesType = type === "invoices";
  const isQuotesSide = sideOnly && type === "quotes";
  const colDefaults = useMemo<(number | null)[]>(
    () => (isInvoicesType
      ? [null, 62, 74, 62, 74, 30]
      : isQuotesSide
        ? [null, 68, 62, 74, 74, 30]
        : [null, 68, 62, 74, 30]),
    [isInvoicesType, isQuotesSide]
  );
  const colsStorageKey = useFormFactorScopedLegacyKey(`recent-sidebar:cols:${type}:v1`);
  const lockStorageKey = useFormFactorScopedLegacyKey(`recent-sidebar:cols-locked:${type}:v1`);
  const [colsLocked, setColsLockedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try { return localStorage.getItem(lockStorageKey) !== "0"; } catch { return true; }
  });
  const setColsLocked = (v: boolean) => {
    setColsLockedState(v);
    try { localStorage.setItem(lockStorageKey, v ? "1" : "0"); } catch { /* noop */ }
  };
  const { widths: colWidths, startDrag: startColDrag, reset: resetCols } =
    useColumnWidths(colsStorageKey, colDefaults, colsLocked);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Persist scroll position across data refetches, limit changes, remounts,
  // AND navigation between input screens (quote/invoice/return/purchase).
  // We use localStorage (not sessionStorage) so the position survives full
  // page reloads and tab restarts; key is per-type so each sidebar keeps its
  // own anchor independently.
  const scrollStorageKey = useFormFactorScopedLegacyKey(`recent-sidebar:scroll:${type}:v1`);
  // Initialize synchronously so the first useLayoutEffect after data load
  // can restore to the correct position (avoids a brief jump to top).
  const savedScrollRef = useRef<number>((() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = localStorage.getItem(scrollStorageKey)
        ?? sessionStorage.getItem(scrollStorageKey);
      const n = raw ? Number(raw) : 0;
      return isNaN(n) ? 0 : n;
    } catch { return 0; }
  })());
  // Continuously remember the latest scrollTop while the user scrolls.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      savedScrollRef.current = el.scrollTop;
      try { localStorage.setItem(scrollStorageKey, String(el.scrollTop)); } catch { /* noop */ }
      try { sessionStorage.setItem(scrollStorageKey, String(el.scrollTop)); } catch { /* noop */ }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollStorageKey]);

  // ===== Hidden columns (per-type, persisted) =====
  // Stable keys for each column position.
  const colKeys = useMemo<string[]>(
    () => (isInvoicesType
      ? ["party", "pay", "status", "date", "amount", "note"]
      : isQuotesSide
        ? ["party", "status", "date", "amount", "user", "note"]
        : ["party", "status", "date", "amount", "note"]),
    [isInvoicesType, isQuotesSide]
  );
  const colLabels: Record<string, string> = {
    party: type === "purchases" ? "المورد" : "العميل",
    pay: "حالة الدفع",
    status: isInvoicesType ? "التجهيز" : "الحالة",
    date: "التاريخ",
    amount: "المبلغ",
    user: "المستخدم",
    note: "ملاحظة",
  };
  const hiddenStorageKey = useFormFactorScopedLegacyKey(`recent-sidebar:hidden:${type}:v1`);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(hiddenStorageKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
    } catch { return new Set(); }
  });
  const persistHidden = (s: Set<string>) => {
    const arr = Array.from(s);
    try { localStorage.setItem(hiddenStorageKey, JSON.stringify(arr)); } catch { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent("recent-sidebar-hidden-update", {
        detail: { key: hiddenStorageKey, hidden: arr },
      }));
    } catch { /* noop */ }
  };
  const hideCol = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev); next.add(key); persistHidden(next); return next;
    });
    // Do NOT auto-redistribute remaining columns' widths — keep user-saved
    // widths intact. The flex (party) column reclaims the freed space.
  };
  const showCol = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev); next.delete(key); persistHidden(next); return next;
    });
  };
  const showAllCols = () => {
    setHiddenCols(() => { const n = new Set<string>(); persistHidden(n); return n; });
  };
  const toggleCol = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      persistHidden(next);
      return next;
    });
  };
  const isHidden = (key: string) => hiddenCols.has(key);
  const hiddenColsRef = useRef(hiddenCols);
  hiddenColsRef.current = hiddenCols;

  // ===== User-customizable font size & density (per-type, persisted) =====
  const stylePrefsKey = useFormFactorScopedLegacyKey(`recent-sidebar:style:${type}:v1`);
  type StylePrefs = { fontPx: number; density: number };
  const defaultStylePrefs: StylePrefs = { fontPx: compact ? 11 : 12, density: 1 };
  const [stylePrefs, setStylePrefsState] = useState<StylePrefs>(() => {
    if (typeof window === "undefined") return defaultStylePrefs;
    try {
      const raw = localStorage.getItem(stylePrefsKey);
      if (!raw) return defaultStylePrefs;
      const parsed = JSON.parse(raw);
      const fontPx = Math.max(8, Math.min(22, Number(parsed?.fontPx) || defaultStylePrefs.fontPx));
      const density = Math.max(0.6, Math.min(2, Number(parsed?.density) || defaultStylePrefs.density));
      return { fontPx, density };
    } catch { return defaultStylePrefs; }
  });
  const setStylePrefs = (next: StylePrefs) => {
    setStylePrefsState(next);
    try { localStorage.setItem(stylePrefsKey, JSON.stringify(next)); } catch { /* noop */ }
  };
  const resetStylePrefs = () => setStylePrefs(defaultStylePrefs);

  // Sync local state when hidden columns are updated externally
  // (cloud pull, other tab via storage event, or another component).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyFromStorage = () => {
      try {
        const raw = localStorage.getItem(hiddenStorageKey);
        const arr = raw ? JSON.parse(raw) : [];
        const next = new Set<string>(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
        const cur = hiddenColsRef.current;
        if (cur.size === next.size && Array.from(cur).every((k) => next.has(k))) return;
        setHiddenCols(next);
      } catch { /* noop */ }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === hiddenStorageKey) applyFromStorage();
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (detail?.key === hiddenStorageKey) applyFromStorage();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("recent-sidebar-hidden-update", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("recent-sidebar-hidden-update", onCustom as EventListener);
    };
     
  }, [hiddenStorageKey]);

  // Keyboard shortcuts: Alt+1..Alt+N toggles column N; Alt+0 shows all.
  // Disabled while typing in inputs/textareas/contenteditable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt) {
        const tag = tgt.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable) return;
      }
      const digit = parseInt(e.key, 10);
      if (isNaN(digit)) return;
      if (digit === 0) {
        e.preventDefault();
        showAllCols();
        toast.success("تم إظهار جميع الأعمدة");
        return;
      }
      const idx = digit - 1;
      if (idx < 0 || idx >= colKeys.length) return;
      e.preventDefault();
      const key = colKeys[idx];
      const willHide = !hiddenColsRef.current.has(key);
      toggleCol(key);
      toast.success(`${willHide ? "إخفاء" : "إظهار"}: ${colLabels[key] || key}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colKeys]);



  // Auto-fit: distribute the available container width across the visible fixed
  // columns (proportionally to their defaults), letting the flex column (العميل)
  // take the remainder. Hidden columns are skipped. Persists via localStorage +
  // custom event so useColumnWidths picks the new values up.
  const autoFitCols = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return false;
    const containerW = el.clientWidth;
    if (!containerW || containerW <= 0) return false;

    const hiddenSet = hiddenColsRef.current;
    const flexVisible = !hiddenSet.has(colKeys[0]); // index 0 is always the flex (party) col

    // Reserve space for the flex (customer) column only when visible.
    const FLEX_MIN = 90;
    const BUFFER = 4;
    let fixedSum = 0;
    colDefaults.forEach((d, i) => {
      if (typeof d === "number" && !hiddenSet.has(colKeys[i])) fixedSum += d;
    });
    if (fixedSum <= 0) return false;

    const reserve = flexVisible ? FLEX_MIN : 0;
    const available = Math.max(0, containerW - reserve - BUFFER);
    const scale = available / fixedSum;

    const next: (number | null)[] = colDefaults.map((d, i) => {
      if (typeof d !== "number") return null;
      if (hiddenSet.has(colKeys[i])) return d; // keep default for hidden (col is forced 0 via colgroup)
      return Math.max(28, Math.round(d * scale));
    });

    try {
      localStorage.setItem(colsStorageKey, JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent("colwidths-shared-update", {
          detail: { key: colsStorageKey, widths: next },
        })
      );
      return true;
    } catch {
      return false;
    }
  }, [colDefaults, colsStorageKey, colKeys]);


  const isInvoices = type === "invoices";
  const isPurchases = type === "purchases";
  const isReturns = type === "returns";
  const statusMap = isInvoices ? invoiceStatusMap : isPurchases ? purchaseStatusMap : isReturns ? returnStatusMap : quoteStatusMap;
  const baseTitle = isInvoices ? "الفواتير" : isPurchases ? "أوامر الشراء" : isReturns ? "المرتجعات" : (sideOnly ? "عروض الأسعار الجانبية" : "عروض الأسعار");
  const title = `آخر ${limit} ${baseTitle}`;
  const editPath = isInvoices ? "/invoices/edit/" : isPurchases ? "/purchase/edit/" : isReturns ? "/stock-return/edit/" : (sideOnly ? "/quotes/side/edit/" : "/quotes/edit/");
  const managePath = isInvoices ? "/invoices" : isPurchases ? "/purchase" : isReturns ? "/stock-return" : (sideOnly ? "/quotes/side" : "/quotes");
  const partyKey = isPurchases ? "suppliers" : "customers";
  const queryKey = isInvoices ? "invoices-with-customers" : isPurchases ? "purchase-orders-with-suppliers" : isReturns ? "stock-returns-with-customers" : "quotes-with-customers";

  const { data: invoices, isLoading: loadingInv } = useInvoicesWithCustomers(isInvoices ? RECENT_FETCH_WINDOW : undefined);
  const { data: quotes, isLoading: loadingQt } = useQuotesWithCustomers(!isInvoices && !isPurchases && !isReturns ? RECENT_FETCH_WINDOW : undefined, { sideOnly });
  const { data: purchases, isLoading: loadingPo } = usePurchaseOrdersWithSuppliers(isPurchases ? RECENT_FETCH_WINDOW : undefined);
  const { data: returns, isLoading: loadingRt } = useStockReturnsWithCustomers(isReturns ? RECENT_FETCH_WINDOW : undefined);

  // Fetch employee names for the user column / filter
  const { data: employees } = useQuery({
    queryKey: ["employees-name-map"],
    enabled: isQuotesSide,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("user_id, name")
        .not("user_id", "is", null);
      if (error) throw error;
      return data || [];
    },
  });
  const userNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    (employees || []).forEach((e: any) => { if (e.user_id) m[e.user_id] = e.name; });
    return m;
  }, [employees]);
  const usersInData = useMemo(() => {
    if (!isQuotesSide) return [] as { uid: string; name: string }[];
    const set = new Map<string, string>();
    (quotes || []).forEach((q: any) => {
      if (q.created_by_uid) set.set(q.created_by_uid, userNameMap[q.created_by_uid] || q.created_by_uid.slice(0, 6));
    });
    return Array.from(set.entries()).map(([uid, name]) => ({ uid, name }));
  }, [isQuotesSide, quotes, userNameMap]);

  const rawData = isInvoices ? (invoices || []) : isPurchases ? (purchases || []) : isReturns ? (returns || []) : (quotes || []);
  const isLoading = isInvoices ? loadingInv : isPurchases ? loadingPo : isReturns ? loadingRt : loadingQt;

  // الفلترة أولاً على نافذة أوسع، ثم الاقتصاص إلى آخر N حسب الاختيار.
  // مثال: عند اختيار "عرض سعر" + 100 نعرض آخر 100 عرض سعر من كامل النافذة،
  // وليس المسودات الموجودة فقط داخل آخر 100 سجل غير مفلتر.
  const filteredData = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rawData as any[]).filter((it) => {
      if (statusFilter !== "all") {
        const fieldVal = isInvoices ? (it.workflow_status || "new") : (it.status || "");
        if (fieldVal !== statusFilter) return false;
      }
      if (isInvoices && payFilter !== "all") {
        const total = Number(it.total || 0);
        const paid = Number(it.paid_amount || 0);
        let pay = "unpaid";
        if (total <= 0) pay = "none";
        else if (paid >= total) pay = "paid";
        else if (paid > 0) pay = "partial";
        if (pay !== payFilter) return false;
      }
      if (isQuotesSide && userFilter !== "all") {
        if ((it.created_by_uid || "") !== userFilter) return false;
      }
      if (term) {
        const partyName = String(it[partyKey]?.name || "").toLowerCase();
        const partyPhone = String(it[partyKey]?.phone || "").toLowerCase();
        const docNo = String(
          it.invoice_number || it.quote_number || it.order_number || it.return_number || ""
        ).toLowerCase();
        if (!partyName.includes(term) && !partyPhone.includes(term) && !docNo.includes(term)) return false;
      }
      return true;
    });
  }, [rawData, statusFilter, payFilter, userFilter, isInvoices, isQuotesSide, search, partyKey]);

  const data = useMemo(() => filteredData.slice(0, limit), [filteredData, limit]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  };

  // Restore scroll position synchronously after the data list re-renders.
  // Triggered when:
  //   - limit changes (10 → 25/50/75/100) → local slice updates
  //   - filter changes → filtered subset changes
  //   - cache patches (status/note updates) replace the array reference
  //   - autosave from quote/invoice edit forms invalidates and refetches
  // Without this, the scroll container would jump back to the top.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = savedScrollRef.current;
    if (target <= 0) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.min(target, max);
  }, [data, filteredData, limit, statusFilter, payFilter, search]);

  // Realtime subscription: auto-refresh list when underlying table changes
  // (e.g. workflow_status updated from another tab/user, or related actions)
  useEffect(() => {
    const table = isInvoices ? "invoices"
      : isPurchases ? "purchase_orders"
      : isReturns ? "stock_returns"
      : "quotes";
    const channel = supabase
      .channel(`recent-${table}-${queryKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          // For UPDATE events, patch cache in-place to avoid a full refetch
          // (which would re-render the table and reset the user's scroll position).
          // Applies to all types: invoices, quotes, purchases, returns.
          if (
            payload.eventType === "UPDATE" &&
            payload.new &&
            (payload.new as any).id
          ) {
            queryClient.setQueriesData<any>({ queryKey: [queryKey] }, (old: any) => {
              if (!Array.isArray(old)) return old;
              const newRow = payload.new as any;
              let found = false;
              const next = old.map((row: any) => {
                if (row.id !== newRow.id) return row;
                found = true;
                // Preserve the joined party relation (customers/suppliers) which
                // isn't included in the realtime payload.
                return { ...row, ...newRow, [partyKey]: row[partyKey] };
              });
              return found ? next : old;
            });
          } else {
            // INSERT/DELETE still need a refetch to add/remove rows
            queryClient.invalidateQueries({ queryKey: [queryKey] });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isInvoices, isPurchases, isReturns, queryKey, queryClient, partyKey]);


  const formatDate = (d: string) => {
    if (!d) return "-";
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = dt.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };

  const formatAmount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    return Number(n || 0).toLocaleString();
  };

  const openNoteDialog = (id: string, current: string) => {
    setNoteDialog({ open: true, id, current: current || "" });
    setNoteValue(current || "");
  };

  const saveNote = async () => {
    if (!noteDialog.id) return;
    setSavingNote(true);
    const table = isInvoices ? "invoices" : isPurchases ? "purchase_orders" : isReturns ? "stock_returns" : "quotes";
    const noteField = isReturns ? "reason" : "notes";
    const { error } = await (supabase as any).from(table).update({ [noteField]: noteValue }).eq("id", noteDialog.id);
    setSavingNote(false);
    if (error) {
      toast.error("فشل حفظ الملاحظة");
    } else {
      toast.success("تم حفظ الملاحظة");
      // Patch cache in-place instead of invalidating, to preserve scroll position.
      const id = noteDialog.id;
      queryClient.setQueriesData<any>({ queryKey: [queryKey] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        let found = false;
        const next = old.map((row: any) => {
          if (row.id !== id) return row;
          found = true;
          return { ...row, [noteField]: noteValue };
        });
        return found ? next : old;
      });
      setNoteDialog({ open: false, id: null, current: "" });
    }
  };

  // Excel-compact styling values — in compact mode, match the in-form products table:
  // (font-size 11px, header bg = primary, cell padding ~2-3px, borders = --border).
  const cellTxt = compact ? "text-[11px]" : "text-[12px]";
  const headTxt = compact ? "text-[11px]" : "text-[12px]";
  const cellPad = compact ? "px-[3px] py-[2px]" : "px-1 py-2";
  const headPad = compact ? "px-[4px] py-[3px]" : "px-1 py-2.5";
  const isQuotes = !isInvoices && !isPurchases && !isReturns;
  const isSideQuotes = isQuotes && sideOnly;
  const headBg = isSideQuotes
    ? "bg-[#7c3aed] text-white"
    : isQuotes
    ? "bg-[#2563eb] text-white"
    : "bg-primary text-primary-foreground";
  const headBorder = isSideQuotes
    ? "border-[#7c3aed]"
    : isQuotes
    ? "border-[#2563eb]"
    : (compact ? "border-border" : "border-primary");
  const cellBorder = compact ? "border-border" : "border-border";
  const badgeCls = compact
    ? "text-[9px] px-1.5 py-0 leading-tight"
    : "text-[11px] px-2.5 py-1";
  const containerCls = compact
    ? "bg-card rounded-sm border border-border overflow-hidden flex flex-col h-full min-h-0"
    : "bg-card rounded-lg border border-border shadow-sm overflow-hidden flex flex-col h-full min-h-0";
  const topBarPad = compact ? "px-2 py-1" : "px-3 py-2.5";
  const topBtnCls = compact
    ? "flex items-center gap-1 px-1.5 py-0.5 text-[10px] border border-border rounded hover:bg-muted transition"
    : "flex items-center gap-1.5 px-3 py-1 text-xs border border-border rounded hover:bg-muted transition";
  const topSelectCls = compact
    ? "bg-card text-foreground text-[10px] rounded px-1 py-0.5 border border-border outline-none"
    : "bg-card text-foreground text-xs rounded px-2 py-1 border border-border outline-none";
  const titleCls = compact ? "text-[11px] font-bold" : "text-sm font-bold";
  const iconSize = compact ? 10 : 12;
  const titleIcon = compact ? 12 : 14;

  // Column min-widths (use min-width instead of fixed width so columns shrink gracefully)
  const wStatus = compact ? "min-w-[52px]" : "min-w-[70px]";
  const wPay = compact ? "min-w-[58px]" : "min-w-[78px]";
  const wDate = compact ? "min-w-[54px]" : "min-w-[72px]";
  const wAmount = compact ? "min-w-[54px]" : "min-w-[72px]";
  const wHash = compact ? "min-w-[24px]" : "min-w-[36px]";

  // حساب حالة الدفع للفواتير من paid_amount مقابل total
  const getPayInfo = (item: any) => {
    const total = Number(item.total || 0);
    const paid = Number(item.paid_amount || 0);
    if (total <= 0) return { label: "—", className: "bg-gray-200 text-gray-600" };
    if (paid >= total) return { label: "مدفوعة", className: "bg-green-500 text-white" };
    if (paid > 0) return { label: "جزئي", className: "bg-yellow-400 text-gray-900" };
    return { label: "غير مدفوعة", className: "bg-red-500 text-white" };
  };

  // Density: combines parent's RowResizer (--recent-density) with user's
  // per-type density preference (stylePrefs.density). Both multiply.
  const densityVar = `calc(var(--recent-density, 1) * ${stylePrefs.density})`;
  const cellPadStyle: React.CSSProperties = compact
    ? { padding: `calc(2px * ${densityVar}) calc(3px * ${densityVar})` }
    : { padding: `calc(8px * ${densityVar}) calc(4px * ${densityVar})` };
  const headPadStyle: React.CSSProperties = compact
    ? { padding: `calc(3px * ${densityVar}) calc(4px * ${densityVar})` }
    : { padding: `calc(10px * ${densityVar}) calc(4px * ${densityVar})` };
  const tableFontStyle: React.CSSProperties = {
    fontSize: `calc(${stylePrefs.fontPx}px * var(--recent-density, 1))`,
  };

  return (
    <div className={containerCls}>
      {/* Header */}
      <div className={`flex items-center justify-between gap-1 flex-wrap border-b border-border bg-card ${topBarPad}`}>
        <button onClick={refresh} className={topBtnCls}>
          <RefreshCw size={iconSize} />
          <span>تحديث</span>
        </button>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className={topSelectCls}
          title="عدد السجلات"
        >
          {LIMIT_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {/* Customize panel: font size + density */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={topBtnCls} title="تخصيص الخط وحجم الجدول">
              <Settings2 size={iconSize} />
              <span>تخصيص</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3 space-y-3" dir="rtl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">تخصيص العرض</span>
              <button
                type="button"
                onClick={resetStylePrefs}
                className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground"
                title="إعادة الضبط"
              >
                <RotateCcw size={10} /> إعادة ضبط
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">حجم الخط</label>
                <span className="text-[11px] font-mono font-bold">{stylePrefs.fontPx}px</span>
              </div>
              <Slider
                min={8}
                max={22}
                step={1}
                value={[stylePrefs.fontPx]}
                onValueChange={(v) => setStylePrefs({ ...stylePrefs, fontPx: v[0] })}
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>صغير</span><span>كبير</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground">كثافة الجدول (الصفوف)</label>
                <span className="text-[11px] font-mono font-bold">{stylePrefs.density.toFixed(2)}×</span>
              </div>
              <Slider
                min={0.6}
                max={2}
                step={0.05}
                value={[stylePrefs.density]}
                onValueChange={(v) => setStylePrefs({ ...stylePrefs, density: Number(v[0].toFixed(2)) })}
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>مضغوط</span><span>مريح</span>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground border-t border-border pt-2 leading-relaxed">
              يُحفظ التخصيص لهذا النوع من القوائم على هذا المتصفح.
              <br />اختصارات: <kbd className="px-1 bg-muted rounded">Alt+1..N</kbd> إخفاء/إظهار عمود، <kbd className="px-1 bg-muted rounded">Alt+0</kbd> إظهار الكل.
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={() => setColsLocked(!colsLocked)}
          className={topBtnCls}
          title={colsLocked ? "فتح القفل لتعديل عرض الأعمدة" : "حفظ وقفل عرض الأعمدة"}
        >
          {colsLocked ? <Lock size={iconSize} /> : <Unlock size={iconSize} />}
          <span>{colsLocked ? "تعديل" : "حفظ"}</span>
        </button>
        {!colsLocked && (
          <button
            type="button"
            onClick={() => {
              const ok = autoFitCols();
              if (ok) toast.success("تم ضبط الأعمدة لتناسب الشاشة");
              else { resetCols(); toast.success("تم إعادة ضبط عرض الأعمدة"); }
            }}
            className={topBtnCls}
            title="إعادة الأعمدة إلى الافتراضي"
          >
            <RefreshCw size={iconSize} />
            <span>إفتراضي</span>
          </button>
        )}
        {hiddenCols.size > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={topBtnCls} title="إظهار أعمدة مخفية">
                <span>أعمدة ({hiddenCols.size})</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {Array.from(hiddenCols).map((k) => {
                const idx = colKeys.indexOf(k);
                return (
                  <DropdownMenuItem key={k} onClick={() => showCol(k)} className="text-xs justify-between gap-3">
                    <span>إظهار: {colLabels[k] || k}</span>
                    {idx >= 0 && <kbd className="text-[10px] opacity-60">Alt+{idx + 1}</kbd>}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem onClick={showAllCols} className="text-xs justify-between gap-3 font-bold">
                <span>إظهار الكل</span>
                <kbd className="text-[10px] opacity-60">Alt+0</kbd>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          onClick={() => navigate(managePath)}
          title={`الذهاب إلى ${title.replace("آخر ", "إدارة ")}`}
          className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition cursor-pointer"
        >
          <h3 className={`${titleCls} truncate`} style={{ color: "hsl(265 70% 55%)" }}>{title}</h3>
          <FileText size={titleIcon} style={{ color: "hsl(265 70% 55%)" }} className="shrink-0" />
        </button>
      </div>

      {/* Filters bar: status filter + search */}
      <div className={`flex items-center gap-1 border-b border-border bg-muted/30 ${topBarPad}`}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${topSelectCls} flex-shrink-0`}
          title="تصفية بالحالة"
        >
          <option value="all">{isInvoices ? "كل مراحل التجهيز" : "كل الحالات"}</option>
          {isInvoices
            ? WORKFLOW_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))
            : Object.entries(statusMap).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
        </select>
        {isInvoices && (
          <select
            value={payFilter}
            onChange={(e) => setPayFilter(e.target.value)}
            className={`${topSelectCls} flex-shrink-0`}
            title="تصفية حسب حالة الدفع"
          >
            <option value="all">كل حالات الدفع</option>
            <option value="paid">مدفوعة</option>
            <option value="partial">جزئي</option>
            <option value="unpaid">غير مدفوعة</option>
          </select>
        )}
        {isQuotesSide && (
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className={`${topSelectCls} flex-shrink-0`}
            title="تصفية حسب المستخدم"
          >
            <option value="all">كل المستخدمين</option>
            {usersInData.map((u) => (
              <option key={u.uid} value={u.uid}>{u.name}</option>
            ))}
          </select>
        )}
        <div className="relative flex-1 min-w-0">
          <Search
            size={iconSize}
            className="absolute top-1/2 -translate-y-1/2 right-1.5 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isPurchases ? "بحث عن المورد..." : "بحث عن العميل..."}
            className={`${topSelectCls} w-full pr-6 ${search ? "pl-5" : ""}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute top-1/2 -translate-y-1/2 left-1 text-muted-foreground hover:text-foreground"
              title="مسح البحث"
            >
              <X size={iconSize} />
            </button>
          )}
        </div>
      </div>

      <TooltipProvider delayDuration={150}>
      <div ref={scrollRef} data-testid="recent-sidebar-scroll" data-sidebar-type={type} className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
      <table className={`w-full border-collapse leading-tight`} style={{ ...tableFontStyle, tableLayout: "fixed" }} dir="rtl">
        <colgroup>
          {colDefaults.map((d, i) => {
            if (isHidden(colKeys[i])) return null;
            const w = colWidths[i];
            const px = typeof w === "number" ? w : (typeof d === "number" ? d : undefined);
            return <col key={i} style={px ? { width: px } : {}} />;
          })}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className={headBg}>
            {!isHidden(colKeys[0]) && (
              <th style={{ ...headPadStyle, position: "relative" }} className={`text-right font-semibold border ${headBorder} ${headTxt} ${headBg}`}>
                <button type="button" onClick={() => hideCol(colKeys[0])} title="اضغط لإخفاء العمود (Alt+رقم العمود)" className="hover:opacity-70 transition">
                  {isPurchases ? "المورد" : "العميل"}
                </button>
                <ColumnResizeHandle hidden={colsLocked} onMouseDown={(e) => startColDrag(0, e)} />
              </th>
            )}
            {isInvoices && !isHidden("pay") && (
              <th style={{ ...headPadStyle, position: "relative" }} className={`text-center font-semibold border ${headBorder} ${headTxt} ${headBg} overflow-hidden`}>
                <button type="button" onClick={() => hideCol("pay")} title="اضغط لإخفاء العمود (Alt+رقم العمود)" className="hover:opacity-70 transition">
                  حالة الدفع
                </button>
                <ColumnResizeHandle hidden={colsLocked} onMouseDown={(e) => startColDrag(1, e)} />
              </th>
            )}
            {!isHidden("status") && (
              <th style={{ ...headPadStyle, position: "relative" }} className={`text-center font-semibold border ${headBorder} ${headTxt} ${headBg} overflow-hidden`}>
                <button type="button" onClick={() => hideCol("status")} title="اضغط لإخفاء العمود (Alt+رقم العمود)" className="hover:opacity-70 transition">
                  {isInvoices ? "التجهيز" : "الحالة"}
                </button>
                <ColumnResizeHandle hidden={colsLocked} onMouseDown={(e) => startColDrag(isInvoices ? 2 : 1, e)} />
              </th>
            )}
            {!isHidden("date") && (
              <th style={{ ...headPadStyle, position: "relative" }} className={`text-center font-semibold border ${headBorder} ${headTxt} ${headBg} overflow-hidden`}>
                <button type="button" onClick={() => hideCol("date")} title="اضغط لإخفاء العمود (Alt+رقم العمود)" className="hover:opacity-70 transition">
                  التاريخ
                </button>
                <ColumnResizeHandle hidden={colsLocked} onMouseDown={(e) => startColDrag(isInvoices ? 3 : 2, e)} />
              </th>
            )}
            {!isHidden("amount") && (
              <th style={{ ...headPadStyle, position: "relative" }} className={`text-center font-semibold border ${headBorder} ${headTxt} ${headBg} overflow-hidden`}>
                <button type="button" onClick={() => hideCol("amount")} title="اضغط لإخفاء العمود (Alt+رقم العمود)" className="hover:opacity-70 transition">
                  المبلغ
                </button>
                <ColumnResizeHandle hidden={colsLocked} onMouseDown={(e) => startColDrag(isInvoices ? 4 : 3, e)} />
              </th>
            )}
            {isQuotesSide && !isHidden("user") && (
              <th style={{ ...headPadStyle, position: "relative" }} className={`text-center font-semibold border ${headBorder} ${headTxt} ${headBg} overflow-hidden`}>
                <button type="button" onClick={() => hideCol("user")} title="اضغط لإخفاء العمود" className="hover:opacity-70 transition">
                  المستخدم
                </button>
                <ColumnResizeHandle hidden={colsLocked} onMouseDown={(e) => startColDrag(4, e)} />
              </th>
            )}
            {!isHidden("note") && (
              <th style={{ ...headPadStyle, position: "relative" }} className={`text-center font-semibold border ${headBorder} ${headTxt} ${headBg} overflow-hidden`}>
                <button type="button" onClick={() => hideCol("note")} title="اضغط لإخفاء العمود (Alt+رقم العمود)" className="hover:opacity-70 transition">
                  ملاحظة
                </button>
                <ColumnResizeHandle hidden={colsLocked} onMouseDown={(e) => startColDrag(isInvoices ? 5 : isQuotesSide ? 5 : 4, e)} />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={colKeys.filter((k) => !isHidden(k)).length || 1} className="text-center py-6 text-muted-foreground">جاري التحميل...</td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={colKeys.filter((k) => !isHidden(k)).length || 1} className="text-center py-6 text-muted-foreground">لا توجد بيانات</td>
            </tr>
          ) : (
            data.map((item: any) => {
              const st = statusMap[item.status] || { label: item.status || "-", className: "bg-gray-300 text-gray-700" };
              const docNumber = isInvoices ? item.invoice_number : isPurchases ? item.order_number : isReturns ? item.return_number : item.quote_number;
              const docLabel = isInvoices ? "فاتورة" : isPurchases ? "أمر شراء" : isReturns ? "مرتجع" : "عرض سعر";
              const partyLabel = isPurchases ? "المورد" : "العميل";
              const partyName = item[partyKey]?.name || "-";
              return (
                <tr key={item.id} className={`hover:bg-muted/40 transition-colors ${compact ? "even:bg-gray-50" : ""}`}>
                  {!isHidden("party") && (
                  <td style={cellPadStyle} className={`text-right border ${cellBorder} text-foreground ${cellTxt} whitespace-normal break-words min-w-0`}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => navigate(`${editPath}${item.id}`)}
                          className="text-right w-full cursor-pointer hover:underline hover:text-primary transition-colors font-medium"
                        >
                          {partyName}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[260px] p-3 space-y-1.5" dir="rtl">
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border">
                          <span className="font-bold text-foreground text-[13px]">
                            {docLabel} #{docNumber || "-"}
                          </span>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${st.className}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="text-[12px] text-foreground">
                          <span className="text-muted-foreground">{partyLabel}: </span>
                          <span className="font-medium">{partyName}</span>
                        </div>
                        <div className="flex items-center justify-between text-[12px]">
                          <span><span className="text-muted-foreground">التاريخ: </span>{formatDate(item.date)}</span>
                          <span className="font-bold text-green-600">{Number(item.total || 0).toLocaleString()}</span>
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-muted-foreground border-t border-border pt-1.5 line-clamp-3">
                            {item.notes}
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </td>
                  )}
                  {isInvoices && !isHidden("pay") && (() => {
                    const pay = getPayInfo(item);
                    return (
                      <td style={cellPadStyle} className={`text-center border ${cellBorder}`}>
                        <span className={`inline-block rounded-full font-bold whitespace-nowrap ${badgeCls} ${pay.className}`}>
                          {pay.label}
                        </span>
                      </td>
                    );
                  })()}
                  {!isHidden("status") && (
                  <td style={cellPadStyle} className={`text-center border ${cellBorder}`}>
                    {isInvoices ? (() => {
                      const ws = (item.workflow_status || "new") as WorkflowStatus;
                      const wsInfo = getWorkflowStatus(ws);
                      const WsIcon = wsInfo.icon;
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className={`inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap cursor-pointer hover:opacity-80 ${badgeCls} ${wsInfo.bg} ${wsInfo.color}`}
                              title="اضغط لتغيير حالة التجهيز"
                            >
                              <WsIcon className="w-3 h-3" />
                              {wsInfo.label}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center" className="min-w-[140px]">
                            {WORKFLOW_STATUSES.map((s) => {
                              const SIcon = s.icon;
                              return (
                                <DropdownMenuItem
                                  key={s.value}
                                  disabled={s.value === ws}
                                  onClick={async () => {
                                    if (s.value === ws) return;
                                    const prevValue = item.workflow_status;
                                    // Optimistic update: patch cache immediately
                                    queryClient.setQueriesData<any>({ queryKey: [queryKey] }, (old: any) => {
                                      if (!Array.isArray(old)) return old;
                                      return old.map((row: any) =>
                                        row.id === item.id ? { ...row, workflow_status: s.value } : row
                                      );
                                    });
                                    const { error } = await (supabase as any)
                                      .from("invoices")
                                      .update({ workflow_status: s.value })
                                      .eq("id", item.id);
                                    if (error) {
                                      // Rollback
                                      queryClient.setQueriesData<any>({ queryKey: [queryKey] }, (old: any) => {
                                        if (!Array.isArray(old)) return old;
                                        return old.map((row: any) =>
                                          row.id === item.id ? { ...row, workflow_status: prevValue } : row
                                        );
                                      });
                                      console.error("Workflow status update failed", error);
                                      toast.error(`فشل تحديث التجهيز: ${error.message}`);
                                     } else {
                                       toast.success("تم تحديث حالة التجهيز");
                                       // Cache already patched optimistically; skip invalidate to preserve scroll.
                                     }
                                  }}

                                  className="text-xs justify-start"
                                >
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${s.bg} ${s.color}`}>
                                    <SIcon className="w-3 h-3" />
                                    {s.label}
                                  </span>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })() : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={`inline-block rounded-full font-bold whitespace-nowrap cursor-pointer hover:opacity-80 ${badgeCls} ${st.className}`}
                            title="اضغط لتغيير الحالة"
                          >
                            {st.label}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-[110px]">
                          {Object.entries(
                            isPurchases ? purchaseStatusMap
                            : isReturns ? returnStatusMap
                            : quoteStatusMap
                          ).map(([key, val]) => (
                            <DropdownMenuItem
                              key={key}
                              disabled={key === item.status}
                              onClick={async () => {
                                if (key === item.status) return;
                                const table = isPurchases ? "purchase_orders"
                                  : isReturns ? "stock_returns"
                                  : "quotes";
                                const prevValue = item.status;
                                // Optimistic patch
                                queryClient.setQueriesData<any>({ queryKey: [queryKey] }, (old: any) => {
                                  if (!Array.isArray(old)) return old;
                                  return old.map((row: any) =>
                                    row.id === item.id ? { ...row, status: key } : row
                                  );
                                });
                                const { error } = await (supabase as any)
                                  .from(table)
                                  .update({ status: key })
                                  .eq("id", item.id);
                                if (error) {
                                  // Rollback
                                  queryClient.setQueriesData<any>({ queryKey: [queryKey] }, (old: any) => {
                                    if (!Array.isArray(old)) return old;
                                    return old.map((row: any) =>
                                      row.id === item.id ? { ...row, status: prevValue } : row
                                    );
                                  });
                                  console.error("Status update failed", error);
                                  toast.error(`فشل تحديث الحالة: ${error.message}`);
                                } else {
                                  toast.success("تم تحديث الحالة");
                                  // Skip invalidate to preserve scroll position.
                                }
                              }}
                              className="text-xs justify-center"
                            >
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${val.className}`}>
                                {val.label}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                  )}
                  {!isHidden("date") && (
                  <td style={cellPadStyle} className={`text-center border ${cellBorder} text-foreground whitespace-nowrap ${compact ? "text-[10px]" : "text-[11px]"}`}>
                    {formatDate(item.date)}
                  </td>
                  )}
                  {!isHidden("amount") && (
                  <td style={cellPadStyle} className={`text-center border ${cellBorder} font-bold text-green-600 whitespace-nowrap ${cellTxt}`}>
                    {formatAmount(Number(item.total || 0))}
                  </td>
                  )}
                  {isQuotesSide && !isHidden("user") && (
                  <td style={cellPadStyle} className={`text-center border ${cellBorder} text-foreground whitespace-nowrap ${cellTxt}`}>
                    {item.created_by_uid ? (userNameMap[item.created_by_uid] || String(item.created_by_uid).slice(0, 6)) : "-"}
                  </td>
                  )}
                  {!isHidden("note") && (
                  <td style={cellPadStyle} className={`text-center border ${cellBorder}`}>
                    {(() => {
                      const noteText = isReturns ? (item.reason || "") : (item.notes || "");
                      const hasNote = noteText.trim().length > 0;
                      return (
                        <button
                          onClick={() => openNoteDialog(item.id, noteText)}
                          className={`${hasNote ? "text-amber-500 hover:text-amber-600" : "text-sky-500 hover:text-sky-600"} transition inline-flex p-0.5`}
                          title={hasNote ? "تعديل الملاحظة" : "إضافة ملاحظة"}
                        >
                          <StickyNote size={compact ? 13 : 16} fill={hasNote ? "currentColor" : "none"} fillOpacity={hasNote ? 0.2 : 0} />
                        </button>
                      );
                    })()}
                  </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
      </TooltipProvider>

      {/* Note Dialog */}
      <Dialog open={noteDialog.open} onOpenChange={(o) => !o && setNoteDialog({ open: false, id: null, current: "" })}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة / تعديل ملاحظة</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            placeholder="اكتب الملاحظة هنا..."
            rows={5}
            className="resize-none"
          />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setNoteDialog({ open: false, id: null, current: "" })}
              disabled={savingNote}
            >
              إلغاء
            </Button>
            <Button onClick={saveNote} disabled={savingNote}>
              {savingNote ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// React.memo: props بدائية (type/compact/sideOnly) ⇒ نمنع re-render مع كل setState في الصفحة الأم.
export default React.memo(RecentItemsSidebarImpl);
