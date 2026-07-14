// Prefetch للبيانات الأساسية — يجعلها متاحة أوفلاين (عبر IDB persister)
// حتى لو المستخدم لم يزر الصفحات المرتبطة بها بعد.
//
// كل استعلام معزول بـ try/catch: فشل واحد لا يوقف البقية، ولا يظهر أي
// خطأ للمستخدم (silent). النتيجة النهائية عبر Promise.allSettled فقط
// للانتظار حتى انتهاء الكل دون رمي.
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function safePrefetch(
  qc: QueryClient,
  queryKey: unknown[],
  queryFn: () => Promise<any>,
) {
  try {
    await qc.prefetchQuery({ queryKey, queryFn, staleTime: 60_000 });
  } catch {
    // صامت — الهدف تحسين تجربة الأوفلاين وليس حرجاً
  }
}

export async function prefetchCoreData(qc: QueryClient): Promise<void> {
  const tasks: Array<Promise<void>> = [
    safePrefetch(qc, ["customers"], async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["suppliers"], async () => {
      const { data, error } = await supabase.from("suppliers").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["products-with-details"], async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("*, product_category_links(*), product_brand_links(*)");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["accounts"], async () => {
      const { data, error } = await supabase.from("accounts").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["transporters"], async () => {
      const { data, error } = await supabase.from("transporters").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["packaging_types"], async () => {
      const { data, error } = await supabase.from("packaging_types").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["destinations"], async () => {
      const { data, error } = await supabase.from("destinations").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["product_categories"], async () => {
      const { data, error } = await supabase.from("product_categories").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["customer_groups"], async () => {
      const { data, error } = await supabase.from("customer_groups").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["warehouses"], async () => {
      const { data, error } = await supabase.from("warehouses").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["currencies"], async () => {
      const { data, error } = await supabase.from("currencies").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["billing_terms"], async () => {
      const { data, error } = await supabase.from("billing_terms").select("*");
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["company_settings"], async () => {
      const { data, error } = await supabase.from("company_settings").select("*");
      if (error) throw error;
      return data;
    }),
    // آخر 100 فاتورة/عرض سعر/طلب شراء — نفس مفاتيح الاستعلامات المستخدمة في الصفحات
    safePrefetch(qc, ["invoices-with-customers", "all", 100], async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name, phone, whatsapp, balance)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["quotes-with-customers", 100, "main"], async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, customers(name)")
        .or("is_side.is.null,is_side.eq.false")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }),
    safePrefetch(qc, ["purchase-orders-full"], async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }),
  ];

  await Promise.allSettled(tasks);
}
