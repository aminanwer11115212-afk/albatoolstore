import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell, AlertTriangle, FileText, Wallet, Activity, Search, RefreshCw, Pin, EyeOff, RotateCcw, Clock, CheckSquare, FileClock } from "lucide-react";
import { useUserScopedLegacyKey } from "@/lib/userScopedKey";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
type Severity = "out" | "low";
type Kind = "invoice" | "payment" | "stock" | "log" | "overdue" | "quote_due" | "todo";

type NotificationItem = {
  id: string;
  kind: Kind;
  title: string;
  desc: string;
  time: string;
  ts: number;
  read: boolean;
  path: string;
  severity?: Severity;
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

const TABLE_LABELS: Record<string, string> = {
  invoices: "فاتورة",
  quotes: "عرض سعر",
  customers: "عميل",
  products: "منتج",
  purchase_orders: "أمر شراء",
  stock_returns: "مرتجع",
  accounts: "حساب",
  invoice_items: "بند فاتورة",
  quote_items: "بند عرض سعر",
  transactions: "حركة مالية",
  suppliers: "مورد",
};
const ACTION_LABELS: Record<string, string> = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" };

function fmtDate(v: any): string {
  if (!v) return "";
  try { return new Date(v).toLocaleDateString("ar-EG"); } catch { return String(v); }
}

function buildLogDetails(r: any): { title?: string; desc?: string; path?: string } {
  const data = r.new_data || r.old_data || {};
  const old = r.old_data || {};
  const action = r.action as "INSERT" | "UPDATE" | "DELETE";
  const aLbl = ACTION_LABELS[action] || action;

  switch (r.table_name) {
    case "transactions": {
      const amount = Number(data.amount ?? 0);
      const type = String(data.type || "");
      const typeAr = type === "income" ? "دخل" : type === "expense" ? "مصروف" : type === "transfer" ? "تحويل" : type === "payment" ? "دفعة" : type === "receipt" ? "قبض" : type;
      const desc = data.description ? ` — ${data.description}` : "";
      const cat = data.category ? ` [${data.category}]` : "";
      return {
        title: `${aLbl} حركة مالية: ${typeAr} ${fmtMoney(amount)}`,
        desc: `${fmtDate(data.date)}${cat}${desc}`,
        path: "/transactions",
      };
    }
    case "invoices": {
      const total = Number(data.total ?? 0);
      const paid = Number(data.paid_amount ?? 0);
      const due = Number(data.due_amount ?? Math.max(0, total - paid));
      const num = data.invoice_number || "";
      let extra = "";
      if (action === "UPDATE") {
        const oldPaid = Number(old.paid_amount ?? 0);
        const diff = paid - oldPaid;
        if (diff > 0) extra = ` • دفعة جديدة ${fmtMoney(diff)}`;
        else if (diff < 0) extra = ` • تخفيض دفعة ${fmtMoney(-diff)}`;
      }
      return {
        title: `${aLbl} فاتورة ${num}`.trim(),
        desc: `الإجمالي ${fmtMoney(total)} • مدفوع ${fmtMoney(paid)} • مستحق ${fmtMoney(due)}${extra}`,
        path: data.id ? `/invoices/edit/${data.id}` : "/invoices",
      };
    }
    case "quotes": {
      const total = Number(data.total ?? 0);
      const num = data.quote_number || "";
      return {
        title: `${aLbl} عرض سعر ${num}`.trim(),
        desc: `الإجمالي ${fmtMoney(total)} • الحالة ${data.status || "—"}`,
        path: data.id ? `/quotes/edit/${data.id}` : "/quotes",
      };
    }
    case "customers": {
      const name = data.name || "—";
      const parts: string[] = [];
      if (data.phone) parts.push(`📞 ${data.phone}`);
      if (data.email) parts.push(`✉ ${data.email}`);
      if (data.company) parts.push(`🏢 ${data.company}`);
      if (data.city || data.address) parts.push(`📍 ${[data.city, data.address].filter(Boolean).join(" - ")}`);
      const bal = Number(data.balance ?? 0);
      if (bal !== 0) parts.push(bal > 0 ? `رصيد مستحق: ${fmtMoney(bal)}` : `رصيد دائن: ${fmtMoney(-bal)}`);
      if (data.notes) parts.push(`📝 ${data.notes}`);
      return {
        title: `${aLbl} عميل: ${name}`,
        desc: parts.join(" • ") || (r.changed_by ? `بواسطة ${r.changed_by}` : "—"),
        path: data.id ? `/customers/${data.id}` : "/customers",
      };
    }
    case "suppliers": {
      const name = data.name || "—";
      const parts: string[] = [];
      if (data.phone) parts.push(`📞 ${data.phone}`);
      if (data.email) parts.push(`✉ ${data.email}`);
      if (data.address) parts.push(`📍 ${data.address}`);
      const bal = Number(data.balance ?? 0);
      if (bal !== 0) parts.push(`الرصيد: ${fmtMoney(bal)}`);
      return { title: `${aLbl} مورد: ${name}`, desc: parts.join(" • ") || "—", path: "/suppliers" };
    }
    case "products": {
      const name = data.name || "—";
      const stock = Number(data.stock_quantity ?? 0);
      const min = Number(data.min_stock ?? 0);
      const price = Number(data.sale_price ?? 0);
      let extra = "";
      if (action === "UPDATE") {
        const oldStock = Number(old.stock_quantity ?? 0);
        const diff = stock - oldStock;
        if (diff !== 0) extra = ` • تغيّر المخزون ${diff > 0 ? "+" : ""}${diff}`;
      }
      return {
        title: `${aLbl} منتج: ${name}`,
        desc: `المخزون ${stock} (حد أدنى ${min}) • السعر ${fmtMoney(price)}${extra}`,
        path: "/products",
      };
    }
    case "accounts": {
      const name = data.name || "—";
      const bal = Number(data.balance ?? 0);
      return {
        title: `${aLbl} حساب: ${name}`,
        desc: `الرصيد ${fmtMoney(bal)}${data.bank_name ? ` • ${data.bank_name}` : ""}`,
        path: "/accounts",
      };
    }
    case "purchase_orders": {
      const total = Number(data.total ?? 0);
      const num = data.order_number || "";
      return {
        title: `${aLbl} أمر شراء ${num}`.trim(),
        desc: `الإجمالي ${fmtMoney(total)} • الحالة ${data.status || "—"}`,
        path: "/purchases",
      };
    }
    case "stock_returns": {
      const total = Number(data.total ?? 0);
      return {
        title: `${aLbl} مرتجع`,
        desc: `الإجمالي ${fmtMoney(total)} • ${fmtDate(data.date)}`,
        path: "/stock-returns",
      };
    }
    case "invoice_items":
    case "quote_items": {
      const isInv = r.table_name === "invoice_items";
      const qty = Number(data.quantity ?? 0);
      const price = Number(data.unit_price ?? 0);
      const total = Number(data.total ?? qty * price);
      return {
        title: `${aLbl} ${isInv ? "بند فاتورة" : "بند عرض سعر"}: ${data.product_name || "—"}`,
        desc: `الكمية ${qty} × ${fmtMoney(price)} = ${fmtMoney(total)}`,
      };
    }
  }
  return {};
}


export default function NotificationsPage() {
  const navigate = useNavigate();
  const NOTIF_READ_KEY = useUserScopedLegacyKey("notif_read_ids");
  const NOTIF_SNOOZE_KEY = useUserScopedLegacyKey("notif_snoozed_stock");
  const [days, setDays] = useState<number>(7);
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  // Pagination — تحميل تدريجي بدل رسم آلاف العناصر دفعة واحدة
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  // أعد تحميل readIds عند تغيُّر المفتاح (مثلاً بعد تأكيد جلسة المستخدم).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY);
      setReadIds(new Set(raw ? JSON.parse(raw) : []));
    } catch { setReadIds(new Set()); }
  }, [NOTIF_READ_KEY]);

  const persistReadIds = useCallback((s: Set<string>) => {
    try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(Array.from(s))); } catch {}
  }, [NOTIF_READ_KEY]);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();

    const todayIso = new Date().toISOString().slice(0, 10);
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [invRes, payRes, stockRes, logRes, overdueRes, quoteDueRes, todoRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, total, created_at, customers(name)")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("invoices")
        .select("id, invoice_number, paid_amount, total, updated_at, customers(name)")
        .gt("paid_amount", 0)
        .gte("updated_at", sinceIso)
        .order("updated_at", { ascending: false })
        .limit(5000),
      supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock, updated_at")
        .order("stock_quantity", { ascending: true })
        .limit(10000),
      (supabase as any)
        .from("activity_log")
        .select("id, table_name, action, record_id, created_at, changed_by, new_data, old_data, changed_fields")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, paid_amount, due_amount, due_date, status, customers(name)")
        .not("due_date", "is", null)
        .lt("due_date", todayIso)
        .order("due_date", { ascending: true })
        .limit(5000),
      supabase
        .from("quotes")
        .select("id, quote_number, total, valid_until, status, customers(name)")
        .not("valid_until", "is", null)
        .lte("valid_until", in7Days)
        .order("valid_until", { ascending: true })
        .limit(5000),
      (supabase as any)
        .from("todos")
        .select("id, title, description, due_date, status, priority, updated_at")
        .not("due_date", "is", null)
        .lte("due_date", in7Days)
        .order("due_date", { ascending: true })
        .limit(5000),
    ]);

    const acc: NotificationItem[] = [];

    (invRes.data || []).forEach((r: any) => {
      const id = `inv:${r.id}:${r.created_at}`;
      acc.push({
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
      acc.push({
        id, kind: "payment",
        title: `دفعة مستلمة ${r.invoice_number || ""}`.trim(),
        desc: `${r.customers?.name ? r.customers.name + " — " : ""}مبلغ ${fmtMoney(r.paid_amount)}`,
        time: timeAgo(r.updated_at),
        ts: new Date(r.updated_at).getTime(),
        read: readIds.has(id),
        path: `/invoices/edit/${r.id}`,
      });
    });

    (stockRes.data || [])
      .filter((p: any) => (p.stock_quantity ?? 0) <= (p.min_stock ?? 0))
      .forEach((p: any) => {
        const q = Number(p.stock_quantity ?? 0);
        const m = Number(p.min_stock ?? 0);
        const out = q <= 0;
        const id = `stock:${p.id}:${q}`;
        acc.push({
          id, kind: "stock",
          title: out ? `نفد المخزون: ${p.name}` : `مخزون منخفض: ${p.name}`,
          desc: out ? `الكمية = 0` : `الكمية ${q} ≤ الحد الأدنى ${m}`,
          time: p.updated_at ? timeAgo(p.updated_at) : "",
          ts: p.updated_at ? new Date(p.updated_at).getTime() : Date.now(),
          read: readIds.has(id),
          path: `/products`,
          severity: out ? "out" : "low",
        });
      });

    (logRes.data || []).forEach((r: any) => {
      const id = `log:${r.id}`;
      const t = TABLE_LABELS[r.table_name] || r.table_name;
      const a = ACTION_LABELS[r.action] || r.action;
      const built = buildLogDetails(r);
      acc.push({
        id, kind: "log",
        title: built.title || `${a} ${t}`,
        desc: built.desc || (r.changed_by ? `بواسطة ${r.changed_by}` : `سجل #${String(r.record_id || "").slice(0, 8)}`),
        time: timeAgo(r.created_at),
        ts: new Date(r.created_at).getTime(),
        read: readIds.has(id),
        path: built.path || `/audit/activity`,
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
        acc.push({
          id, kind: "overdue",
          title: `فاتورة متأخرة ${r.invoice_number || ""}`.trim(),
          desc: `${r.customers?.name ? r.customers.name + " — " : ""}مستحق ${fmtMoney(due)} • متأخر ${daysLate} يوم`,
          time: `تاريخ الاستحقاق ${fmtDate(r.due_date)}`,
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
        acc.push({
          id, kind: "quote_due",
          title: expired ? `عرض سعر منتهي ${r.quote_number || ""}`.trim() : `عرض سعر يقترب انتهاؤه ${r.quote_number || ""}`.trim(),
          desc: `${r.customers?.name ? r.customers.name + " — " : ""}بقيمة ${fmtMoney(r.total)} • صلاحية حتى ${fmtDate(r.valid_until)}`,
          time: expired ? `منتهي منذ ${fmtDate(r.valid_until)}` : `ينتهي ${fmtDate(r.valid_until)}`,
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
        acc.push({
          id, kind: "todo",
          title: overdue ? `مهمة متأخرة: ${r.title}` : `مهمة قادمة: ${r.title}`,
          desc: `${r.priority ? `[${r.priority}] ` : ""}موعد الاستحقاق ${fmtDate(r.due_date)}${r.description ? ` • ${r.description}` : ""}`,
          time: r.updated_at ? timeAgo(r.updated_at) : "",
          ts: new Date(r.due_date).getTime(),
          read: readIds.has(id),
          path: "/todos",
          severity: overdue ? "out" : "low",
        });
      });

    acc.sort((a, b) => b.ts - a.ts);
    setItems(acc);
    setLoading(false);
  }, [days, readIds]);

  useEffect(() => { load();   }, [days]);

  // Realtime — يعيد التحميل تلقائياً عند تغيّر المخزون/الفواتير/المهام
  // لتظهر الإشعارات الجديدة بدون انتظار إعادة تحميل يدوية.
  useEffect(() => {
    let pending: any = null;
    const debouncedReload = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { load(); pending = null; }, 800);
    };
    const channel = (supabase as any)
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "todos" }, debouncedReload)
      .subscribe();
    return () => {
      if (pending) clearTimeout(pending);
      try { (supabase as any).removeChannel(channel); } catch {}
    };
  }, [load]);

  // إخفاء مؤقت لإشعارات المخزون (يُحفظ مع تاريخ انتهاء)
  const SNOOZE_KEY = NOTIF_SNOOZE_KEY;
  const SNOOZE_MS = 2 * 60 * 60 * 1000; // ساعتان
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(SNOOZE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      const cleaned: Record<string, number> = {};
      Object.entries(obj as Record<string, number>).forEach(([k, v]) => { if (v > now) cleaned[k] = v; });
      return cleaned;
    } catch { return {}; }
  });

  // أعد تحميل snoozed عند تغيُّر المفتاح.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SNOOZE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      const cleaned: Record<string, number> = {};
      Object.entries(obj as Record<string, number>).forEach(([k, v]) => { if (v > now) cleaned[k] = v; });
      setSnoozed(cleaned);
    } catch { setSnoozed({}); }
  }, [SNOOZE_KEY]);

  const persistSnoozed = useCallback((s: Record<string, number>) => {
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch {}
  }, [SNOOZE_KEY]);

  const stockKey = (n: NotificationItem) => `${n.kind}:${n.title}`;

  const snoozeStock = (n: NotificationItem) => {
    const next = { ...snoozed, [stockKey(n)]: Date.now() + SNOOZE_MS };
    setSnoozed(next);
    persistSnoozed(next);
  };

  const unsnoozeAll = () => {
    setSnoozed({});
    persistSnoozed({});
  };

  const filtered = useMemo(() => {
    const q = search.trim();
    const now = Date.now();
    const list = items.filter(n => {
      if (kindFilter !== "all" && n.kind !== kindFilter) return false;
      if (q && !startsWithAny([n.title, n.desc], q)) return false;
      if (n.kind === "stock") {
        const until = snoozed[stockKey(n)];
        if (until && until > now) return false;
      }
      return true;
    });
    const rank = (n: NotificationItem) => {
      if (n.kind === "overdue") return 0;
      if (n.kind === "stock" && n.severity === "out") return 1;
      if (n.kind === "quote_due" && n.severity === "out") return 2;
      if (n.kind === "todo" && n.severity === "out") return 3;
      if (n.kind === "stock" && n.severity === "low") return 4;
      if (n.kind === "quote_due") return 5;
      if (n.kind === "todo") return 6;
      return 7;
    };
    return [...list].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return b.ts - a.ts;
    });
  }, [items, kindFilter, search, snoozed]);

  const snoozedCount = useMemo(() => {
    const now = Date.now();
    return Object.values(snoozed).filter(v => v > now).length;
  }, [snoozed]);

  const counts = useMemo(() => ({
    all: items.length,
    invoice: items.filter(i => i.kind === "invoice").length,
    payment: items.filter(i => i.kind === "payment").length,
    stock: items.filter(i => i.kind === "stock").length,
    log: items.filter(i => i.kind === "log").length,
    overdue: items.filter(i => i.kind === "overdue").length,
    quote_due: items.filter(i => i.kind === "quote_due").length,
    todo: items.filter(i => i.kind === "todo").length,
    unread: items.filter(i => !i.read).length,
  }), [items]);

  const markAllRead = () => {
    const next = new Set(readIds);
    filtered.forEach(n => next.add(n.id));
    setReadIds(next);
    persistReadIds(next);
    setItems(prev => prev.map(n => filtered.some(f => f.id === n.id) ? { ...n, read: true } : n));
  };

  const handleClick = (n: NotificationItem) => {
    const next = new Set(readIds);
    next.add(n.id);
    setReadIds(next);
    persistReadIds(next);
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    navigate(n.path);
  };

  const iconFor = (n: NotificationItem) => {
    if (n.kind === "stock") return <AlertTriangle size={16} className={n.severity === "out" ? "text-destructive" : "text-orange-500"} />;
    if (n.kind === "invoice") return <FileText size={16} className="text-primary" />;
    if (n.kind === "payment") return <Wallet size={16} className="text-emerald-600" />;
    if (n.kind === "overdue") return <Clock size={16} className="text-destructive" />;
    if (n.kind === "quote_due") return <FileClock size={16} className={n.severity === "out" ? "text-destructive" : "text-orange-500"} />;
    if (n.kind === "todo") return <CheckSquare size={16} className={n.severity === "out" ? "text-destructive" : "text-blue-500"} />;
    return <Activity size={16} className="text-muted-foreground" />;
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h5 className="flex items-center gap-2 m-0">
            <Bell size={18} /> كل الإشعارات
            <span className="text-xs text-muted-foreground font-normal">
              ({filtered.length} من {counts.all} • غير مقروء: {counts.unread})
            </span>
          </h5>
          <div className="flex items-center gap-2">
            {snoozedCount > 0 && (
              <button onClick={unsnoozeAll} className="btn-xs btn-warning flex items-center gap-1" title="استرجاع تنبيهات المخزون المُخفاة">
                <RotateCcw size={12} /> إظهار المُخفاة ({snoozedCount})
              </button>
            )}
            <button onClick={markAllRead} className="btn-xs btn-info">تحديد الظاهر كمقروء</button>
            <button onClick={load} className="btn-xs btn-default" title="تحديث">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <hr />

        <div className="legacy-form-horizontal" style={{ marginBottom: "1rem" }}>
          <div className="legacy-form-row">
            <label className="legacy-form-label">المدة</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={String(days)} onChange={e => setDays(Number(e.target.value))}>
                <option value="1">اليوم فقط</option>
                <option value="3">آخر 3 أيام</option>
                <option value="7">آخر 7 أيام</option>
                <option value="14">آخر 14 يوم</option>
                <option value="30">آخر 30 يوم</option>
                <option value="90">آخر 90 يوم</option>
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">النوع</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={kindFilter} onChange={e => setKindFilter(e.target.value as any)}>
                <option value="all">الكل ({counts.all})</option>
                <option value="invoice">فواتير ({counts.invoice})</option>
                <option value="payment">دفعات ({counts.payment})</option>
                <option value="stock">مخزون ({counts.stock})</option>
                <option value="overdue">فواتير متأخرة ({counts.overdue})</option>
                <option value="quote_due">عروض أسعار منتهية ({counts.quote_due})</option>
                <option value="todo">مهام ({counts.todo})</option>
                <option value="log">سجل النشاط ({counts.log})</option>
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">بحث</label>
            <div className="legacy-form-control-wrap">
              <div className="relative">
                <Search size={12} className="absolute top-2.5 right-2 text-muted-foreground" />
                <input
                  className="legacy-control"
                  style={{ paddingRight: 26 }}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث في العنوان أو الوصف..."
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-6 text-sm text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">لا توجد إشعارات تطابق الفلتر</div>
        ) : (
          <div className="space-y-1">
            {filtered.map(n => {
              const isOut = n.severity === "out";
              const isLow = n.severity === "low";
              const isPinned = n.kind === "stock" && (isOut || isLow);
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex items-start gap-3 px-3 py-2.5 border border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors ${!n.read ? "bg-primary/5" : "bg-card"} ${isOut ? "border-r-4 border-r-destructive" : isLow ? "border-r-4 border-r-orange-500" : ""}`}
                >
                  <div className="flex-shrink-0 mt-0.5">{iconFor(n)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-medium truncate flex items-center gap-1 ${isOut ? "text-destructive" : "text-foreground"}`}>
                        {isPinned && <Pin size={11} className={isOut ? "text-destructive" : "text-orange-500"} />}
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!n.read && <span className="w-2 h-2 rounded-full bg-primary" />}
                        {isPinned && (
                          <button
                            onClick={(e) => { e.stopPropagation(); snoozeStock(n); }}
                            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted"
                            title="إخفاء مؤقت لمدة ساعتين"
                          >
                            <EyeOff size={11} /> إخفاء
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.desc}</p>
                    {n.time && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{n.time}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
