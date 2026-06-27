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
    ],
  },
  invoice_items: {
    events: ["invoice-items:changed"],
    keys: [["invoice-items"], ["invoices"], ["invoices-with-customers"]],
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

export function startRealtimeSync(queryClient: QueryClient): () => void {
  const timers: Record<string, number> = {};
  const channels: any[] = [];

  const flush = (table: string) => {
    const fam = FAMILIES[table];
    if (!fam) return;
    fam.keys.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: key, refetchType: "active" })
    );
    fam.events?.forEach((ev) => window.dispatchEvent(new Event(ev)));
  };

  const scheduleFlush = (table: string) => {
    if (timers[table]) window.clearTimeout(timers[table]);
    timers[table] = window.setTimeout(() => flush(table), 200);
  };

  Object.keys(FAMILIES).forEach((table) => {
    const channel = supabase
      .channel(`rt:${table}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => scheduleFlush(table)
      )
      .subscribe();
    channels.push(channel);
  });

  return () => {
    Object.values(timers).forEach((id) => window.clearTimeout(id));
    channels.forEach((ch) => supabase.removeChannel(ch));
  };
}
