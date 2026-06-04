import { supabase } from "@/integrations/supabase/client";
import { fetchAllProducts } from "@/lib/fetchAllProducts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
//  Generic hook for all tables — with full Optimistic UI support
//  • update  → يُعدَّل الكاش فوراً ثم يُثبَّت/يُرجَع بعد رد الخادم
//  • insert  → يُضاف صف مؤقت فوراً ثم يُستبدل بالبيانات الحقيقية
//  • remove  → يُحذف الصف فوراً ثم يُرجَع عند الفشل
// ─────────────────────────────────────────────────────────────────────────────
function useTable<T extends keyof Tables<any>>(table: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(table).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // ── INSERT ── يُضاف الصف فوراً بـ ID مؤقت ثم يُحدَّث بعد DB ──
  const insert = useMutation({
    mutationFn: async (row: any) => {
      const { data, error } = await (supabase as any).from(table).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onMutate: async (row: any) => {
      await queryClient.cancelQueries({ queryKey: [table] });
      const previous = queryClient.getQueryData<any[]>([table]);
      const tempId = `__optimistic_${Date.now()}`;
      queryClient.setQueryData<any[]>([table], (old) =>
        [{ ...row, id: tempId, created_at: new Date().toISOString(), __optimistic: true }, ...(old || [])]
      );
      return { previous, tempId };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) queryClient.setQueryData([table], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
      if (table === "products") {
        window.dispatchEvent(new Event("products:changed"));
      } else if (table === "customers") {
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "suppliers") {
        window.dispatchEvent(new Event("suppliers:changed"));
      } else if (table === "transactions") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        queryClient.invalidateQueries({ queryKey: ["accounts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["recent-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["transactions-with-accounts"] });
        window.dispatchEvent(new Event("customers:changed"));
        window.dispatchEvent(new Event("suppliers:changed"));
        window.dispatchEvent(new Event("accounts:changed"));
      } else if (table === "invoices") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["invoices-with-customers"] });
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "stock_returns") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "purchase_orders") {
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        window.dispatchEvent(new Event("suppliers:changed"));
      }
    },
  });

  // ── UPDATE ── يُعدَّل الكاش فوراً ──
  const update = useMutation({
    mutationFn: async ({ id, ...row }: any) => {
      const { data, error } = await (supabase as any)
        .from(table).update(row).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...row }: any) => {
      await queryClient.cancelQueries({ queryKey: [table] });
      const previous = queryClient.getQueryData<any[]>([table]);
      queryClient.setQueryData<any[]>([table], (old) =>
        (old || []).map((item: any) =>
          item.id === id ? { ...item, ...row, __saving: true } : item
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) queryClient.setQueryData([table], context.previous);
    },
    // Optimistic update يضمن دقة الكاش — لا داعي لـ refetch فوري بعد كل تعديل.
    // نُعلِّم الاستعلام كـ stale فقط ليُحدَّث عند إعادة التركيب أو focus.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [table], refetchType: "none" });
      if (table === "products") {
        window.dispatchEvent(new Event("products:changed"));
      } else if (table === "customers") {
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "suppliers") {
        window.dispatchEvent(new Event("suppliers:changed"));
      } else if (table === "transactions") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        queryClient.invalidateQueries({ queryKey: ["accounts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["recent-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["transactions-with-accounts"] });
        window.dispatchEvent(new Event("customers:changed"));
        window.dispatchEvent(new Event("suppliers:changed"));
        window.dispatchEvent(new Event("accounts:changed"));
      } else if (table === "invoices") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["invoices-with-customers"] });
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "stock_returns") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "purchase_orders") {
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        window.dispatchEvent(new Event("suppliers:changed"));
      }
    },
  });

  // ── REMOVE ── يُزال الصف فوراً ──
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: [table] });
      const previous = queryClient.getQueryData<any[]>([table]);
      queryClient.setQueryData<any[]>([table], (old) =>
        (old || []).filter((item: any) => item.id !== id)
      );
      return { previous };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) queryClient.setQueryData([table], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [table] });
      if (table === "products") {
        window.dispatchEvent(new Event("products:changed"));
      } else if (table === "customers") {
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "suppliers") {
        window.dispatchEvent(new Event("suppliers:changed"));
      } else if (table === "transactions") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        queryClient.invalidateQueries({ queryKey: ["accounts"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["recent-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["transactions-with-accounts"] });
        window.dispatchEvent(new Event("customers:changed"));
        window.dispatchEvent(new Event("suppliers:changed"));
        window.dispatchEvent(new Event("accounts:changed"));
      } else if (table === "invoices") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        queryClient.invalidateQueries({ queryKey: ["invoices-with-customers"] });
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "stock_returns") {
        queryClient.invalidateQueries({ queryKey: ["customers"] });
        window.dispatchEvent(new Event("customers:changed"));
      } else if (table === "purchase_orders") {
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        window.dispatchEvent(new Event("suppliers:changed"));
      }
    },
  });

  return { ...query, insert, update, remove };
}

export function useCustomers() { return useTable("customers"); }
export function useCustomerGroups() { return useTable("customer_groups"); }
export function useSuppliers() { return useTable("suppliers"); }
export function useProducts() { return useTable("products"); }
export function useProductCategories() { return useTable("product_categories"); }
export function useWarehouses() { return useTable("warehouses"); }
export function useAccounts() { return useTable("accounts"); }
export function useTransactions() { return useTable("transactions"); }
export function useInvoices() { return useTable("invoices"); }
export function useInvoiceItems() { return useTable("invoice_items"); }
export function usePurchaseOrders() { return useTable("purchase_orders"); }
export function useStockReturns() { return useTable("stock_returns"); }
export function useTransporters() { return useTable("transporters"); }
export function usePackagingTypes() { return useTable("packaging_types"); }
export function useProjects() { return useTable("projects"); }
export function useCompanySettings() { return useTable("company_settings"); }
export function useQuotes() { return useTable("quotes"); }
export function useStockTransfers() { return useTable("stock_transfers"); }
export function useDestinations() { return useTable("destinations"); }
export function useTransactionCategories() { return useTable("transaction_categories"); }
export function useBillingTerms() { return useTable("billing_terms"); }
export function useNotes() { return useTable("notes"); }
export function useDocuments() { return useTable("documents"); }
export function useTodos() { return useTable("todos"); }
export function useGoals() { return useTable("goals"); }
export function useEmployees() { return useTable("employees"); }

// Batch A: Advanced Packaging & Transport
export function useInvoicePackaging() { return useTable("invoice_packaging"); }
export function useInvoicesPackagingItems() { return useTable("invoices_packaging_items"); }
export function useInvoiceTransports() { return useTable("invoice_transports"); }
export function useQuotesPackaging() { return useTable("quotes_packaging"); }
export function useQuotesPackagingItems() { return useTable("quotes_packaging_items"); }
export function useQuoteTransports() { return useTable("quote_transports"); }
export function useCustomerDestinations() { return useTable("customer_destinations"); }
export function useCustomerPreferredTransporter() { return useTable("customer_preferred_transporter"); }
export function useCustomerTransporters() { return useTable("customer_transporters"); }
export function useDestinationTransporters() { return useTable("destination_transporters"); }

// Batch B: Invoice Revisions (audit log)
export function useInvoiceRevisions() { return useTable("invoice_revisions"); }

// Batch C: Activity Log + Deleted Items
export function useActivityLog() { return useTable("activity_log"); }
export function useDeletedInvoiceItems() { return useTable("deleted_invoice_items"); }
export function useDeletedQuoteItems() { return useTable("deleted_quote_items"); }

// Batch D: Currencies & Exchange Rates
export function useCurrencies() { return useTable("currencies"); }
export function useExchangeRates() { return useTable("exchange_rates"); }

// Specialized queries
export function useInvoicesWithCustomers(limit?: number) {
  return useQuery({
    queryKey: ["invoices-with-customers", limit],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, customers(name, phone, balance)")
        .order("created_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useTransactionsWithAccounts() {
  return useQuery({
    queryKey: ["transactions-with-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, accounts:account_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useProductsWithDetails() {
  return useQuery({
    queryKey: ["products-with-details"],
    staleTime: 5_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // نجلب كل المنتجات مقسّمة دفعات (تجاوز حدّ Supabase الافتراضي 1000 صف).
      const productsData = await fetchAllProducts<any>(
        "*",
        { column: "created_at", ascending: false },
      );
      const [categoriesRes, warehousesRes, companiesRes, linksRes, suppliersRes, brandLinksRes] = await Promise.all([
        supabase.from("product_categories").select("id, name"),
        supabase.from("warehouses").select("id, name"),
        supabase.from("product_companies").select("id, name"),
        (supabase as any).from("product_category_links").select("product_id, category_id"),
        supabase.from("suppliers").select("id, name"),
        (supabase as any).from("product_brand_links").select("product_id, brand_id"),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (warehousesRes.error) throw warehousesRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (linksRes.error) throw linksRes.error;
      if (suppliersRes.error) throw suppliersRes.error;
      if (brandLinksRes.error) throw brandLinksRes.error;

      const categoriesMap = new Map((categoriesRes.data || []).map((item: any) => [item.id, item.name]));
      const warehousesMap = new Map((warehousesRes.data || []).map((item: any) => [item.id, item.name]));
      const companiesMap = new Map((companiesRes.data || []).map((item: any) => [item.id, item.name]));
      const suppliersMap = new Map((suppliersRes.data || []).map((item: any) => [item.id, item.name]));

      // فئات متعددة لكل منتج (M2M)
      const productCategoriesMap = new Map<string, Array<{ id: string; name: string }>>();
      (linksRes.data || []).forEach((link: any) => {
        const arr = productCategoriesMap.get(link.product_id) || [];
        const name = categoriesMap.get(link.category_id);
        if (name) arr.push({ id: link.category_id, name: String(name) });
        productCategoriesMap.set(link.product_id, arr);
      });

      // ماركات متعددة لكل منتج (M2M)
      const productBrandsMap = new Map<string, Array<{ id: string; name: string }>>();
      (brandLinksRes.data || []).forEach((link: any) => {
        const arr = productBrandsMap.get(link.product_id) || [];
        const name = companiesMap.get(link.brand_id);
        if (name) arr.push({ id: link.brand_id, name: String(name) });
        productBrandsMap.set(link.product_id, arr);
      });

      return (productsData || []).map((product: any) => {
        const cats = productCategoriesMap.get(product.id) || [];
        const brands = productBrandsMap.get(product.id) || [];
        return {
          ...product,
          // تكامل خلفي: نُبقي product_categories ككائن واحد (أول فئة) للعرض القديم
          product_categories: cats.length > 0
            ? { name: cats.map((c) => c.name).join("، ") }
            : (product.category_id ? { name: categoriesMap.get(product.category_id) || null } : null),
          // قائمة الفئات الجديدة
          categories: cats,
          warehouses: product.warehouse_id ? { name: warehousesMap.get(product.warehouse_id) || null } : null,
          // ماركات متعددة + تكامل خلفي
          product_companies: brands.length > 0
            ? { name: brands.map((b) => b.name).join("، ") }
            : (product.company_id ? { name: companiesMap.get(product.company_id) || null } : null),
          brands,
          suppliers: product.supplier_id ? { name: suppliersMap.get(product.supplier_id) || null } : null,
        };
      });
    },
  });
}


// جلب فئات منتج واحد (مفيد لشاشات الفاتورة/العرض/المشتريات)
export async function fetchProductCategories(productId: string): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await (supabase as any)
    .from("product_category_links")
    .select("category_id, product_categories:category_id(id, name)")
    .eq("product_id", productId);
  if (error) throw error;
  return (data || []).map((l: any) => l.product_categories).filter(Boolean);
}

// جلب جميع روابط فئات المنتجات دفعة واحدة (لاستخدامها في شاشات الإنشاء)
export function useAllProductCategoryLinks() {
  return useQuery({
    queryKey: ["product_category_links_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_category_links")
        .select("product_id, category_id");
      if (error) throw error;
      return data as Array<{ product_id: string; category_id: string }>;
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [customers, products, invoices, transactions] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("invoices").select("total, paid_amount, status"),
        supabase.from("transactions").select("type, amount"),
      ]);
      
      const totalSales = (invoices.data || []).reduce((sum: number, inv: any) => sum + Number(inv.total || 0), 0);
      const totalIncome = (transactions.data || []).filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalExpenses = (transactions.data || []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);

      return {
        customersCount: customers.count || 0,
        productsCount: products.count || 0,
        invoicesCount: (invoices.data || []).length,
        totalSales,
        totalIncome,
        totalExpenses,
      };
    },
  });
}

export function useLowStockProducts() {
  return useQuery({
    queryKey: ["low-stock-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock")
        .order("stock_quantity", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data || []).filter((p: any) => (p.stock_quantity ?? 0) <= (p.min_stock ?? 0));
    },
  });
}

export function useRecentTransactions() {
  return useQuery({
    queryKey: ["recent-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, accounts:account_id(name), customers(name), suppliers(name)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });
}

export function useCashFlowChart() {
  return useQuery({
    queryKey: ["cash-flow-chart"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("transactions")
        .select("date, type, amount")
        .gte("date", dateStr)
        .order("date", { ascending: true });
      if (error) throw error;

      const dayMap: Record<string, { date: string; income: number; expense: number }> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - 29 + i);
        const key = d.toISOString().split("T")[0];
        dayMap[key] = { date: key, income: 0, expense: 0 };
      }

      (data || []).forEach((t: any) => {
        if (dayMap[t.date]) {
          if (t.type === "income") dayMap[t.date].income += Number(t.amount || 0);
          else if (t.type === "expense") dayMap[t.date].expense += Number(t.amount || 0);
        }
      });

      return Object.values(dayMap);
    },
  });
}

export function useQuotesWithCustomers(limit?: number, opts?: { sideOnly?: boolean }) {
  const sideOnly = !!opts?.sideOnly;
  return useQuery({
    queryKey: ["quotes-with-customers", limit, sideOnly ? "side" : "main"],
    queryFn: async () => {
      let query = supabase
        .from("quotes")
        .select("*, customers(name)")
        .order("created_at", { ascending: false });
      if (sideOnly) query = query.eq("is_side", true);
      else query = query.or("is_side.is.null,is_side.eq.false");
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
