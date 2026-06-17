import { Bell, Mail, Menu, Search, User, LogOut, Settings, Moon, Sun, Maximize, ChevronDown, FileText, ShoppingCart, Users, Calculator, X, Command, Wallet, Receipt, Truck, RotateCcw, AlertTriangle, PackageX, ZoomIn, ZoomOut } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AccountsOpeningBalanceDialog from "@/components/dashboard/AccountsOpeningBalanceDialog";
import OnlineUsersIndicator from "@/components/layout/OnlineUsersIndicator";
import { useScreenZoom } from "@/hooks/useScreenZoom";
import { useUserScopedLegacyKey } from "@/lib/userScopedKey";

interface AppNavbarProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

const quickActions = [
  { label: "فاتورة جديدة", path: "/invoices/create", icon: FileText, tags: "invoice create" },
  { label: "عرض سعر جديد", path: "/quotes/create", icon: FileText, tags: "quote" },
  { label: "إضافة عميل", path: "/customers/create", icon: Users, tags: "customer" },
  { label: "إضافة منتج", path: "/products/add", icon: ShoppingCart, tags: "product" },
  { label: "المعاملات", path: "/transactions", icon: Calculator, tags: "transaction" },
  { label: "الإعدادات", path: "/settings/company", icon: Settings, tags: "settings" },
  { label: "الإحصائيات", path: "/reports/statistics", icon: FileText, tags: "statistics" },
  { label: "كشف حساب عميل", path: "/reports/customer-statement", icon: FileText, tags: "statement" },
];

type NotificationItem = {
  id: string;
  kind: "invoice" | "payment" | "stock" | "log";
  title: string;
  desc: string;
  time: string;
  ts: number;
  read: boolean;
  path: string;
  severity?: "out" | "low";
};

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `منذ ${s} ثانية`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const days = Math.floor(h / 24);
  return `منذ ${days} يوم`;
}

function fmtMoney(n: any): string {
  return Number(n || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

type SearchItem = {
  kind: "action" | "customer" | "invoice" | "quote" | "purchase" | "return";
  id: string;
  label: string;
  sub?: string;
  path: string;
  icon: any;
};

export default function AppNavbar({ onToggleSidebar, sidebarCollapsed }: AppNavbarProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showOpeningBalances, setShowOpeningBalances] = useState(false);
  const [results, setResults] = useState<{
    customers: any[];
    invoices: any[];
    quotes: any[];
    purchases: any[];
    returns: any[];
  }>({ customers: [], invoices: [], quotes: [], purchases: [], returns: [] });
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme, isDark } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeCustomerId = useMemo(() => {
    if (!location.pathname.startsWith("/customers")) return null;
    return new URLSearchParams(location.search).get("view");
  }, [location.pathname, location.search]);
  const searchRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  // تكبير مستقل لهيدر النظام، محفوظ لكل مستخدم.
  const { zoom: headerZoom, inc: headerZoomInc, dec: headerZoomDec } = useScreenZoom("app-header", headerRef as React.RefObject<HTMLElement>, "--header-zoom");

  const [notifTab, setNotifTab] = useState<"today" | "stock" | "log">("today");
  const [todayItems, setTodayItems] = useState<NotificationItem[]>([]);
  const [stockItems, setStockItems] = useState<NotificationItem[]>([]);
  const [logItems, setLogItems] = useState<NotificationItem[]>([]);
  const NOTIF_READ_KEY = useUserScopedLegacyKey("notif_read_ids");
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  // أعد تحميل readIds عند تغيُّر المفتاح (بعد تأكيد جلسة المستخدم).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY);
      setReadIds(new Set(raw ? JSON.parse(raw) : []));
    } catch { setReadIds(new Set()); }
  }, [NOTIF_READ_KEY]);

  const persistReadIds = useCallback((s: Set<string>) => {
    try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(Array.from(s))); } catch {}
  }, [NOTIF_READ_KEY]);

  const loadToday = useCallback(async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sinceIso = startOfDay.toISOString();
    const todayIso = new Date().toISOString().slice(0, 10);
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [invRes, payRes, overdueRes, quoteDueRes, todoRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, total, created_at, customers(name)")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("invoices")
        .select("id, invoice_number, paid_amount, total, updated_at, customers(name)")
        .gt("paid_amount", 0)
        .gte("updated_at", sinceIso)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, paid_amount, due_amount, due_date, status, customers(name)")
        .not("due_date", "is", null)
        .lt("due_date", todayIso)
        .order("due_date", { ascending: true })
        .limit(500),
      supabase
        .from("quotes")
        .select("id, quote_number, total, valid_until, status, customers(name)")
        .not("valid_until", "is", null)
        .lte("valid_until", in7Days)
        .order("valid_until", { ascending: true })
        .limit(500),
      (supabase as any)
        .from("todos")
        .select("id, title, due_date, status, priority, updated_at")
        .not("due_date", "is", null)
        .lte("due_date", in7Days)
        .order("due_date", { ascending: true })
        .limit(500),
    ]);

    const items: NotificationItem[] = [];
    (invRes.data || []).forEach((r: any) => {
      const id = `inv:${r.id}:${r.created_at}`;
      items.push({
        id, kind: "invoice",
        title: `فاتورة جديدة ${r.invoice_number || ""}`.trim(),
        desc: `${r.customers?.name ? r.customers.name + " — " : ""}بقيمة ${fmtMoney(r.total)}`,
        time: timeAgo(r.created_at),
        ts: new Date(r.created_at).getTime(),
        read: readIds.has(id),
        path: `/invoices/edit/${r.id}`,
      });
    });
    (payRes.data || []).forEach((r: any) => {
      const id = `pay:${r.id}:${r.updated_at}`;
      items.push({
        id, kind: "payment",
        title: `دفعة مستلمة ${r.invoice_number || ""}`.trim(),
        desc: `${r.customers?.name ? r.customers.name + " — " : ""}مبلغ ${fmtMoney(r.paid_amount)}`,
        time: timeAgo(r.updated_at),
        ts: new Date(r.updated_at).getTime(),
        read: readIds.has(id),
        path: `/invoices/edit/${r.id}`,
      });
    });
    (overdueRes.data || [])
      .filter((r: any) => {
        const due = Number(r.due_amount ?? Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)));
        return due > 0 && r.status !== "cancelled" && r.status !== "paid";
      })
      .forEach((r: any) => {
        const due = Number(r.due_amount ?? Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)));
        const daysLate = Math.max(1, Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000));
        const id = `overdue:${r.id}:${r.due_date}`;
        items.push({
          id, kind: "invoice",
          title: `فاتورة متأخرة ${r.invoice_number || ""}`.trim(),
          desc: `${r.customers?.name ? r.customers.name + " — " : ""}مستحق ${fmtMoney(due)} • متأخر ${daysLate} يوم`,
          time: "",
          ts: new Date(r.due_date).getTime(),
          read: readIds.has(id),
          path: `/invoices/edit/${r.id}`,
          severity: "out",
        });
      });
    (quoteDueRes.data || [])
      .filter((r: any) => {
        const s = String(r.status || "").toLowerCase();
        return s !== "converted" && s !== "accepted" && s !== "rejected" && s !== "cancelled";
      })
      .forEach((r: any) => {
        const id = `qdue:${r.id}:${r.valid_until}`;
        const expired = new Date(r.valid_until).getTime() < Date.now();
        items.push({
          id, kind: "invoice",
          title: expired ? `عرض سعر منتهي ${r.quote_number || ""}`.trim() : `عرض سعر يقترب انتهاؤه ${r.quote_number || ""}`.trim(),
          desc: `${r.customers?.name ? r.customers.name + " — " : ""}بقيمة ${fmtMoney(r.total)}`,
          time: "",
          ts: new Date(r.valid_until).getTime(),
          read: readIds.has(id),
          path: `/quotes/edit/${r.id}`,
          severity: expired ? "out" : "low",
        });
      });
    (todoRes.data || [])
      .filter((r: any) => {
        const s = String(r.status || "").toLowerCase();
        return s !== "done" && s !== "completed" && s !== "cancelled";
      })
      .forEach((r: any) => {
        const id = `todo:${r.id}:${r.due_date}`;
        const overdue = new Date(r.due_date).getTime() < Date.now() - 86400000;
        items.push({
          id, kind: "invoice",
          title: overdue ? `مهمة متأخرة: ${r.title}` : `مهمة قادمة: ${r.title}`,
          desc: `${r.priority ? `[${r.priority}] ` : ""}موعد ${r.due_date}`,
          time: "",
          ts: new Date(r.due_date).getTime(),
          read: readIds.has(id),
          path: "/todos",
          severity: overdue ? "out" : "low",
        });
      });
    items.sort((a, b) => b.ts - a.ts);
    setTodayItems(items);
  }, [readIds]);

  const loadStock = useCallback(async () => {
    // نفس منطق DashboardStockAlert: stock_quantity ≤ min_stock
    const { data } = await supabase
      .from("products")
      .select("id, name, stock_quantity, min_stock, updated_at")
      .order("stock_quantity", { ascending: true })
      .limit(500);

    const items: NotificationItem[] = (data || [])
      .filter((p: any) => (p.stock_quantity ?? 0) <= (p.min_stock ?? 0))
      .map((p: any) => {
        const q = Number(p.stock_quantity ?? 0);
        const m = Number(p.min_stock ?? 0);
        const out = q <= 0;
        const id = `stock:${p.id}:${q}`;
        return {
          id,
          kind: "stock" as const,
          title: out ? `نفد المخزون: ${p.name}` : `مخزون منخفض: ${p.name}`,
          desc: out ? `الكمية = 0` : `الكمية ${q} ≤ الحد الأدنى ${m}`,
          time: p.updated_at ? timeAgo(p.updated_at) : "",
          ts: p.updated_at ? new Date(p.updated_at).getTime() : 0,
          read: readIds.has(id),
          path: `/products`,
          severity: out ? ("out" as const) : ("low" as const),
        };
      });
    setStockItems(items);
  }, [readIds]);

  const loadLog = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("activity_log")
      .select("id, table_name, action, record_id, created_at, changed_by")
      .order("created_at", { ascending: false })
      .limit(500);

    const tableLabels: Record<string, string> = {
      invoices: "فاتورة",
      quotes: "عرض سعر",
      customers: "عميل",
      products: "منتج",
      purchase_orders: "أمر شراء",
      stock_returns: "مرتجع",
      accounts: "حساب",
    };
    const actionLabels: Record<string, string> = {
      INSERT: "إضافة",
      UPDATE: "تعديل",
      DELETE: "حذف",
    };

    const items: NotificationItem[] = (data || []).map((r: any) => {
      const id = `log:${r.id}`;
      const t = tableLabels[r.table_name] || r.table_name;
      const a = actionLabels[r.action] || r.action;
      return {
        id,
        kind: "log" as any,
        title: `${a} ${t}`,
        desc: r.changed_by ? `بواسطة ${r.changed_by}` : `سجل #${String(r.record_id || "").slice(0, 8)}`,
        time: timeAgo(r.created_at),
        ts: new Date(r.created_at).getTime(),
        read: readIds.has(id),
        path: `/activity-log`,
      };
    });
    setLogItems(items);
  }, [readIds]);

  const loadCurrentTab = useCallback(() => {
    if (notifTab === "today") loadToday();
    else if (notifTab === "stock") loadStock();
    else loadLog();
  }, [notifTab, loadToday, loadStock, loadLog]);

  useEffect(() => {
    // حمّل كل التبويبات عند التحميل ليعكس العدّاد كل الإشعارات الحقيقية
    loadToday();
    loadStock();
    loadLog();
    const t = setInterval(() => { loadToday(); loadStock(); loadLog(); }, 60_000);
    return () => clearInterval(t);
  }, [loadToday, loadStock, loadLog]);

  useEffect(() => {
    if (showNotifications) loadCurrentTab();
  }, [showNotifications, loadCurrentTab]);

  const visibleItems = notifTab === "today" ? todayItems : notifTab === "stock" ? stockItems : logItems;
  const unreadCount =
    todayItems.filter(n => !n.read).length +
    stockItems.filter(n => !n.read).length +
    logItems.filter(n => !n.read).length;
  const outCount = stockItems.filter(n => n.severity === "out").length;
  const lowCount = stockItems.filter(n => n.severity === "low").length;
  const hasUnreadOut =
    stockItems.some(n => n.severity === "out" && !n.read) ||
    todayItems.some(n => n.severity === "out" && !n.read);

  const markAllRead = useCallback(() => {
    const next = new Set(readIds);
    visibleItems.forEach(n => next.add(n.id));
    setReadIds(next);
    persistReadIds(next);
    const setter = notifTab === "today" ? setTodayItems : notifTab === "stock" ? setStockItems : setLogItems;
    setter(prev => prev.map(n => ({ ...n, read: true })));
  }, [visibleItems, readIds, persistReadIds, notifTab]);

  const handleNotifClick = useCallback((n: NotificationItem) => {
    const next = new Set(readIds);
    next.add(n.id);
    setReadIds(next);
    persistReadIds(next);
    setShowNotifications(false);
    navigate(n.path);
  }, [readIds, persistReadIds, navigate]);

  // Debounce the query (200ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch dynamic results when search opens or query changes
  useEffect(() => {
    if (!showSearch) return;
    let cancelled = false;
    const q = debouncedQuery;
    setLoading(true);
    (async () => {
      try {
        if (q) {
          const like = `%${q}%`;
          const c = await supabase
            .from("customers")
            .select("id,name,phone,company")
            .or(`name.ilike.${like},phone.ilike.${like},company.ilike.${like}`)
            .limit(15);
          if (!cancelled) {
            setResults({ customers: c.data || [], invoices: [], quotes: [], purchases: [], returns: [] });
          }
        } else {
          const c = await supabase
            .from("customers")
            .select("id,name,phone,company")
            .order("created_at", { ascending: false })
            .limit(15);
          if (!cancelled) {
            setResults({ customers: c.data || [], invoices: [], quotes: [], purchases: [], returns: [] });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showSearch, debouncedQuery]);

  // Build flat list of items for navigation (customers only)
  const sections = useMemo(() => {
    const customerItems: SearchItem[] = results.customers.map((c) => ({
      kind: "customer", id: c.id, label: c.name,
      sub: [c.phone, c.company].filter(Boolean).join(" • "),
      path: `/customers?view=${c.id}`, icon: Users,
    }));
    return [
      { title: "العملاء", items: customerItems },
    ].filter((s) => s.items.length > 0);
  }, [results]);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Keyboard shortcut: Ctrl+K or /
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setShowSearch(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    if (e.key === "Escape") {
      setShowSearch(false);
      setShowProfile(false);
      setShowNotifications(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  const openItem = (item: SearchItem) => {
    navigate(item.path);
    setShowSearch(false);
    setSearchQuery("");
  };

  // Keyboard navigation in search
  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      openItem(flatItems[selectedIndex]);
    }
  };

  // Reset selected index when query changes
  useEffect(() => { setSelectedIndex(0); }, [searchQuery, results]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  // Helper: render a section
  let runningIndex = -1;
  const renderSection = (title: string, items: SearchItem[]) => {
    if (items.length === 0) return null;
    return (
      <div key={title} className="border-b border-border last:border-b-0">
        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground bg-muted/40 sticky top-0">{title}</div>
        {items.map((item) => {
          runningIndex++;
          const i = runningIndex;
          const isActive = item.kind === "customer" && activeCustomerId === item.id;
          return (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => openItem(item)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`flex items-center gap-3 w-full px-4 py-2 text-sm transition-colors text-right ${
                i === selectedIndex
                  ? "bg-primary/10 text-primary"
                  : isActive
                  ? "bg-primary/5 text-foreground border-r-2 border-primary"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <item.icon size={15} className={i === selectedIndex || isActive ? "text-primary" : "text-muted-foreground"} />
              <div className="flex-1 min-w-0">
                <div className="truncate flex items-center gap-2">
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold shrink-0">مفتوح الآن</span>
                  )}
                </div>
                {item.sub && <div className="text-[10px] text-muted-foreground truncate">{item.sub}</div>}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <header
        ref={headerRef as any}
        style={{
          height: "calc(2.75rem * var(--header-zoom, 1))",
          fontSize: "calc(0.8125rem * var(--header-zoom, 1))",
        }}
        className={`fixed top-0 left-0 bg-navbar text-navbar-text z-30 flex items-center justify-between px-2 md:px-3 transition-all duration-300 ${
          sidebarCollapsed ? "right-0 md:right-14" : "right-0 md:right-44"
        }`}
      >
        <div className="flex items-center gap-2">
          <button onClick={onToggleSidebar} className="p-1.5 hover:bg-primary/20 rounded-md transition-colors">
            <Menu size={16} />
          </button>

          {/* Desktop Search */}
          <div className="hidden md:flex items-center bg-foreground/10 rounded-md px-2 py-1 relative group cursor-pointer"
               onClick={() => { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 50); }}>
            <Search size={13} className="ml-1.5 opacity-60" />
            <input
              ref={searchRef}
              type="text"
              placeholder="بحث عن عميل بالاسم أو الهاتف..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearch(true)}
              onKeyDown={handleSearchKey}
              className="bg-transparent border-none outline-none text-xs text-navbar-text placeholder:text-navbar-text/50 w-56"
            />
            <kbd className="hidden lg:inline-flex items-center gap-0.5 bg-foreground/10 text-navbar-text/50 text-[9px] px-1 py-0.5 rounded font-mono">
              <Command size={9} />K
            </kbd>
            {searchQuery && (
              <button onClick={(e) => { e.stopPropagation(); setSearchQuery(""); setShowSearch(false); }} className="opacity-60 hover:opacity-100 mr-1">
                <X size={14} />
              </button>
            )}

            {/* Search Dropdown */}
            {showSearch && (
              <div className="absolute top-full right-0 mt-1 w-96 bg-card border border-border rounded-xl shadow-2xl z-50 py-1 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">↑↓ تنقل · Enter فتح · Esc إغلاق</p>
                  {loading && <span className="text-[10px] text-muted-foreground">...جاري البحث</span>}
                </div>
                <div className="max-h-[28rem] overflow-y-auto">
                  {sections.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-6">
                      {searchQuery ? `لا توجد نتائج لـ "${searchQuery}"` : "لا توجد بيانات"}
                    </p>
                  ) : (
                    sections.map((s) => renderSection(s.title, s.items))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Opening balances quick button (next to search) */}
          <button
            onClick={() => setShowOpeningBalances(true)}
            className="hidden md:inline-flex items-center gap-1 bg-foreground/10 hover:bg-primary/20 rounded-md px-2 py-1 text-[11px] transition-colors"
            title="تعديل المبالغ المبدئية للحسابات"
          >
            <Wallet size={13} />
            <span>المبالغ المبدئية</span>
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Mobile Search */}
          <button className="p-1.5 md:hidden hover:bg-primary/20 rounded-md transition-colors" onClick={() => setShowSearch(true)}>
            <Search size={15} />
          </button>

          {/* Fullscreen */}
          <button onClick={handleFullscreen} className="hidden md:flex p-1.5 hover:bg-primary/20 rounded-md transition-colors" title="ملء الشاشة">
            <Maximize size={15} />
          </button>

          {/* Header zoom (per-user) */}
          <button onClick={headerZoomDec} className="hidden md:flex p-1.5 hover:bg-primary/20 rounded-md transition-colors" title="تصغير الهيدر">
            <ZoomOut size={15} />
          </button>
          <span className="hidden md:inline-flex items-center text-[10px] opacity-70 min-w-[28px] justify-center select-none">
            {Math.round(headerZoom * 100)}%
          </span>
          <button onClick={headerZoomInc} className="hidden md:flex p-1.5 hover:bg-primary/20 rounded-md transition-colors" title="تكبير الهيدر">
            <ZoomIn size={15} />
          </button>

          {/* Dark Mode Toggle */}
          <button onClick={toggleTheme} className="p-1.5 hover:bg-primary/20 rounded-md transition-colors" title="تبديل المظهر">
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* مؤشر المستخدمين المتصلين */}
          <OnlineUsersIndicator />


          {outCount > 0 && (
            <button
              onClick={() => { setShowNotifications(true); setNotifTab("stock"); setShowProfile(false); }}
              className="hidden md:flex items-center gap-1 px-2 py-1 bg-destructive text-destructive-foreground rounded-md text-[11px] font-bold animate-pulse hover:opacity-90 transition-opacity"
              title="منتجات نفد مخزونها"
            >
              <PackageX size={12} />
              <span>{outCount} نفد</span>
            </button>
          )}

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
              className="relative p-1.5 hover:bg-primary/20 rounded-md transition-colors"
            >
              <Bell size={15} className={hasUnreadOut ? "text-destructive" : ""} />
              {unreadCount > 0 && (
                <span className={`absolute top-0 left-0 w-3.5 h-3.5 bg-destructive text-destructive-foreground text-[9px] rounded-full flex items-center justify-center animate-scale-in ${hasUnreadOut ? "animate-pulse ring-2 ring-destructive/40" : ""}`}>
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute left-0 top-12 bg-card border border-border rounded-xl shadow-2xl w-80 z-50 animate-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-sm text-foreground">الإشعارات</h3>
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline">تحديد الكل كمقروء</button>
                </div>
                <div className="flex border-b border-border bg-muted/30">
                  {([
                    { key: "today", label: "اليوم", count: todayItems.length },
                    { key: "stock", label: "المخزون", count: stockItems.length },
                    { key: "log", label: "السجل", count: logItems.length },
                  ] as const).map(t => (
                    <button
                      key={t.key}
                      onClick={() => setNotifTab(t.key)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        notifTab === t.key
                          ? "text-primary border-b-2 border-primary bg-card"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                      {t.key === "stock" && outCount > 0 && (
                        <span className="mr-1 text-[10px] font-bold text-destructive">({outCount} نفد)</span>
                      )}
                      {notifTab === t.key && t.key !== "stock" && t.count > 0 && (
                        <span className="mr-1 text-[10px] opacity-70">({t.count})</span>
                      )}
                    </button>
                  ))}
                </div>
                {notifTab === "stock" && (outCount > 0 || lowCount > 0) && (
                  <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center gap-3 text-[11px]">
                    {outCount > 0 && (
                      <span className="flex items-center gap-1 text-destructive font-semibold">
                        <span className="w-2 h-2 rounded-full bg-destructive" /> نفد: {outCount}
                      </span>
                    )}
                    {lowCount > 0 && (
                      <span className="flex items-center gap-1 text-orange-500 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-orange-500" /> منخفض: {lowCount}
                      </span>
                    )}
                  </div>
                )}
                <div className="max-h-72 overflow-y-auto">
                  {visibleItems.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {notifTab === "today" ? "لا توجد إشعارات اليوم" : notifTab === "stock" ? "لا توجد تنبيهات مخزون" : "السجل فارغ"}
                    </div>
                  ) : visibleItems.map(n => {
                    const isOut = n.severity === "out";
                    const isLow = n.severity === "low";
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`px-4 py-3 border-b border-border hover:bg-muted/50 cursor-pointer transition-colors ${!n.read ? "bg-primary/5" : ""} ${isOut ? "border-r-4 border-r-destructive" : isLow ? "border-r-4 border-r-orange-500" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          {isOut ? (
                            <AlertTriangle size={14} className="text-destructive mt-0.5 flex-shrink-0" />
                          ) : isLow ? (
                            <AlertTriangle size={14} className="text-orange-500 mt-0.5 flex-shrink-0" />
                          ) : !n.read ? (
                            <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                          ) : null}
                          <div className={(!n.read || isOut || isLow) ? "" : "mr-4"}>
                            <p className={`text-sm font-medium ${isOut ? "text-destructive" : "text-foreground"}`}>{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                            {n.time && <p className="text-xs text-muted-foreground/70 mt-1">{n.time}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 py-2 border-t border-border">
                  <button onClick={() => { setShowNotifications(false); navigate("/notifications"); }} className="text-xs text-primary hover:underline w-full text-center">عرض كل الإشعارات</button>
                </div>
              </div>
            )}
          </div>

          {/* Messages */}
          <button className="relative p-1.5 hover:bg-primary/20 rounded-md transition-colors hidden md:flex" title="الرسائل">
            <Mail size={15} />
          </button>

          {/* Profile */}
          <div className="relative mr-1" ref={profileRef}>
            <button
              onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
              className="flex items-center gap-1.5 hover:bg-primary/20 rounded-md p-1 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <User size={13} className="text-primary-foreground" />
              </div>
              <div className="hidden lg:block text-right">
                <p className="text-[11px] font-medium leading-tight">المدير</p>
                <p className="text-[9px] opacity-70 leading-tight">admin</p>
              </div>
              <ChevronDown size={12} className="hidden lg:block opacity-60" />
            </button>

            {showProfile && (
              <div className="absolute left-0 top-12 bg-card border border-border rounded-xl shadow-2xl w-56 z-50 animate-fade-in">
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                      <User size={18} className="text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{user?.email?.split('@')[0] || 'المدير'}</p>
                      <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
                    </div>
                  </div>
                </div>
                <div className="py-1">
                  <button onClick={() => { navigate("/settings/company"); setShowProfile(false); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                    <User size={14} className="text-muted-foreground" /> الملف الشخصي
                  </button>
                  <button onClick={() => { navigate("/settings/company"); setShowProfile(false); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                    <Settings size={14} className="text-muted-foreground" /> الإعدادات
                  </button>
                </div>
                <div className="border-t border-border py-1">
                  <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors">
                    <LogOut size={14} /> تسجيل الخروج
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Click overlay to close search */}
      {showSearch && <div className="fixed inset-0 z-20" onClick={() => setShowSearch(false)} />}

      <AccountsOpeningBalanceDialog open={showOpeningBalances} onOpenChange={setShowOpeningBalances} />
    </>
  );
}
