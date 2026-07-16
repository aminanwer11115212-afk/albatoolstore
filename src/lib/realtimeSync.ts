import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Realtime sync — قناة واحدة لكل جدول رئيسي.
 * عند أي INSERT/UPDATE/DELETE من أي جهاز:
 *   1) يطلق window event مطابق لما يطلقه useTable (products:changed, customers:changed, …)
 *      → يستفيد منه ProductsCacheSync الموجود + أي مستمعين محليين.
 *   2) يُبطل مفاتيح React Query ذات الصلة (active فقط) مع debounce لتجميع
 *      الأحداث المتزامنة (حفظ فاتورة بـ 10 بنود ⇒ موجة واحدة).
 *
 * كل الإبطالات بـ refetchType: "active" — لا نُجبر صفحات مغلقة على إعادة الجلب.
 */

type Family = {
  /** events to dispatch on window */
  events?: string[];
  /** React Query keys to invalidate */
  keys: string[][];
};

const FAMILIES: Record<string, Family> = {
  invoices: {
    events: ["invoices:changed"],
    keys: [
      ["invoices"],
      ["invoices-with-customers"],
      ["dashboard-stats"],
      ["recent-invoices"],
      ["today-invoices"],
      ["customers"],
      ["customer-statement"],
      ["customer-transactions"],
    ],
  },
  invoice_items: {
    events: ["invoice-items:changed"],
    keys: [["invoice-items"], ["invoices"], ["invoices-with-customers"], ["customer-statement"]],
  },
  quotes: {
    events: ["quotes:changed"],
    keys: [["quotes"], ["quotes-with-customers"], ["side-quotes"], ["dashboard-stats"]],
  },
  quote_items: {
    events: ["quote-items:changed"],
    keys: [["quote-items"], ["quotes"], ["quotes-with-customers"]],
  },
  customers: {
    events: ["customers:changed"],
    keys: [["customers"], ["customer"], ["dashboard-stats"]],
  },
  suppliers: {
    events: ["suppliers:changed"],
    keys: [["suppliers"], ["supplier"], ["dashboard-stats"]],
  },
  products: {
    events: ["products:changed"],
    keys: [
      ["products"],
      ["products-with-details"],
      ["low-stock-products"],
      ["dashboard-stats"],
    ],
  },
  accounts: {
    events: ["accounts:changed"],
    keys: [["accounts"], ["dashboard-stats"]],
  },
  transactions: {
    events: ["transactions:changed"],
    keys: [
      ["transactions"],
      ["transactions-with-accounts"],
      ["recent-transactions"],
      ["accounts"],
      ["customers"],
      ["suppliers"],
      ["dashboard-stats"],
    ],
  },
  purchase_orders: {
    events: ["purchases:changed"],
    keys: [["purchase_orders"], ["purchases-with-suppliers"], ["suppliers"], ["dashboard-stats"]],
  },
  purchase_order_items: {
    events: ["purchase-items:changed"],
    keys: [["purchase_order_items"], ["purchase_orders"]],
  },
  invoice_transports: {
    events: ["transports:changed"],
    keys: [["invoice_transports"], ["transports"], ["invoices"], ["invoices-with-customers"]],
  },
  invoice_packaging: {
    events: ["packaging:changed"],
    keys: [["invoice_packaging"], ["packaging"], ["invoices"], ["invoices-with-customers"]],
  },
  stock_returns: {
    events: ["stock-returns:changed"],
    keys: [["stock_returns"], ["products"], ["customers"]],
  },
  stock_return_items: {
    keys: [["stock_return_items"], ["stock_returns"]],
  },
  product_categories: {
    events: ["product-categories:changed", "products:changed"],
    keys: [["product_categories"], ["products-with-details"]],
  },
  product_companies: {
    events: ["product-companies:changed", "products:changed"],
    keys: [["product_companies"], ["products-with-details"]],
  },
  warehouses: {
    events: ["warehouses:changed", "products:changed"],
    keys: [["warehouses"], ["products-with-details"]],
  },
  product_category_links: {
    events: ["products:changed"],
    keys: [["product_category_links_all"], ["products"], ["products-with-details"]],
  },
  product_brand_links: {
    events: ["products:changed"],
    keys: [["product_brand_links_all"], ["products"], ["products-with-details"]],
  },
};

export type SyncStatus = "connecting" | "live" | "degraded" | "offline";

export interface SyncState {
  status: SyncStatus;
  lastEventAt: number | null;
  lastPollAt: number | null;
  connectedTables: number;
  totalTables: number;
  failures: number;
  lastError: string | null;
  lastRequestId: string | null;
}

const listeners = new Set<(s: SyncState) => void>();
let currentState: SyncState = {
  status: "connecting",
  lastEventAt: null,
  lastPollAt: null,
  connectedTables: 0,
  totalTables: Object.keys(FAMILIES).length,
  failures: 0,
  lastError: null,
  lastRequestId: null,
};

function setState(patch: Partial<SyncState>) {
  currentState = { ...currentState, ...patch };
  listeners.forEach((l) => { try { l(currentState); } catch { /* noop */ } });
}

export function getSyncState(): SyncState { return currentState; }

export function subscribeSyncState(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  fn(currentState);
  return () => { listeners.delete(fn); };
}

/** بولّينج احتياطي عندما ينقطع Realtime — يضمن وصول تحديثات
 *  أوامر الشراء/الفواتير/إلخ حتى لو تعطّل WebSocket على شبكة الجوّال. */
const POLL_INTERVAL_MS = 30_000;

export function startRealtimeSync(queryClient: QueryClient): () => void {
  const timers: Record<string, number> = {};
  const channels: Array<{ table: string; ch: any; connected: boolean }> = [];
  let pollTimer: number | null = null;
  let retryTimer: number | null = null;
  let disposed = false;

  const flush = (table: string) => {
    const fam = FAMILIES[table];
    if (!fam) return;
    fam.keys.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: key, refetchType: "active" })
    );
    fam.events?.forEach((ev) => window.dispatchEvent(new Event(ev)));
    setState({ lastEventAt: Date.now() });
  };

  const scheduleFlush = (table: string) => {
    if (timers[table]) window.clearTimeout(timers[table]);
    timers[table] = window.setTimeout(() => flush(table), 200);
  };

  const recomputeStatus = () => {
    const connected = channels.filter((c) => c.connected).length;
    let status: SyncStatus;
    if (typeof navigator !== "undefined" && !navigator.onLine) status = "offline";
    else if (connected === 0) status = "connecting";
    else if (connected < channels.length) status = "degraded";
    else status = "live";
    setState({ status, connectedTables: connected });
  };

  const scheduleRetry = () => {
    if (disposed || retryTimer) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      const broken = channels.filter((c) => !c.connected);
      broken.forEach((c) => {
        try { supabase.removeChannel(c.ch); } catch { /* noop */ }
        const idx = channels.indexOf(c);
        if (idx >= 0) channels.splice(idx, 1);
        subscribeTable(c.table);
      });
    }, 5_000);
  };

  const subscribeTable = (table: string) => {
    const requestId = `${table}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = { table, ch: null as any, connected: false };
    const channel = supabase
      .channel(`rt:${table}:${requestId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => scheduleFlush(table)
      )
      .subscribe((status: string, err?: Error) => {
        if (status === "SUBSCRIBED") {
          entry.connected = true;
          setState({ lastRequestId: requestId, lastError: null });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          entry.connected = false;
          setState({
            failures: currentState.failures + 1,
            lastError: `[${table}] ${status}${err ? `: ${err.message}` : ""} (rid=${requestId})`,
            lastRequestId: requestId,
          });
          // eslint-disable-next-line no-console
          console.warn("[realtime]", requestId, table, status, err?.message);
          scheduleRetry();
        }
        recomputeStatus();
      });
    entry.ch = channel;
    channels.push(entry);
  };

  // بولّينج احتياطي: أي جدول غير متصل يُبطَّل كاشه دوريًا
  const runPoll = () => {
    if (disposed) return;
    setState({ lastPollAt: Date.now() });
    channels.filter((c) => !c.connected).forEach((c) => flush(c.table));
    if (channels.every((c) => c.connected) && currentState.status === "live") {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"], refetchType: "active" });
    }
  };

  Object.keys(FAMILIES).forEach(subscribeTable);
  pollTimer = window.setInterval(runPoll, POLL_INTERVAL_MS);

  const onOnline = () => { recomputeStatus(); scheduleRetry(); };
  const onOffline = () => setState({ status: "offline" });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    disposed = true;
    Object.values(timers).forEach((id) => window.clearTimeout(id));
    if (pollTimer) window.clearInterval(pollTimer);
    if (retryTimer) window.clearTimeout(retryTimer);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    channels.forEach(({ ch }) => { try { supabase.removeChannel(ch); } catch { /* noop */ } });
  };
}
