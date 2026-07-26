-- ============================================================
-- مجاميع لوحة التحكم في SQL بدل تنزيل الجداول كاملة إلى المتصفح
--
-- useDashboardStats كان يجلب كل صفوف invoices (total/status/source/date)
-- وكل صفوف transactions (type/amount) ليجمعها في JavaScript — ويُعاد ذلك
-- كل 30 ثانية أثناء فتح اللوحة (runPoll يُبطل dashboard-stats). مع نمو
-- البيانات يصبح هذا تنزيلاً متكرراً لميغابايتات، إضافة إلى قصّ Supabase
-- الصامت عند 1000 صف الذي كان سيجعل المجاميع خاطئة أصلاً.
-- نفس المعادلات تماماً (استبعاد الملغاة، فصل POS، سنة من 1 يناير).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH inv AS (
    SELECT total, COALESCE(source, 'regular') AS source, date
      FROM public.invoices
     WHERE lower(COALESCE(status, '')) <> 'cancelled'
  ),
  agg AS (
    SELECT
      count(*)::int                                                  AS invoices_count,
      count(*) FILTER (WHERE source <> 'pos')::int                   AS regular_count,
      count(*) FILTER (WHERE source = 'pos')::int                    AS pos_count,
      COALESCE(sum(total), 0)                                        AS total_sales,
      COALESCE(sum(total) FILTER (WHERE source <> 'pos'), 0)         AS regular_sales,
      COALESCE(sum(total) FILTER (WHERE source = 'pos'), 0)          AS pos_sales,
      COALESCE(sum(total) FILTER (WHERE source <> 'pos'
        AND date >= date_trunc('year', CURRENT_DATE)::date), 0)      AS regular_sales_year,
      COALESCE(sum(total) FILTER (WHERE source = 'pos'
        AND date >= date_trunc('year', CURRENT_DATE)::date), 0)      AS pos_sales_year
    FROM inv
  ),
  tx AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE type = 'income'), 0)  AS total_income,
      COALESCE(sum(amount) FILTER (WHERE type = 'expense'), 0) AS total_expenses
    FROM public.transactions
  )
  SELECT jsonb_build_object(
    'customersCount',        (SELECT count(*)::int FROM public.customers),
    'productsCount',         (SELECT count(*)::int FROM public.products),
    'invoicesCount',         agg.invoices_count,
    'regularInvoicesCount',  agg.regular_count,
    'posInvoicesCount',      agg.pos_count,
    'totalSales',            agg.total_sales,
    'regularSales',          agg.regular_sales,
    'posSales',              agg.pos_sales,
    'regularSalesYear',      agg.regular_sales_year,
    'posSalesYear',          agg.pos_sales_year,
    'totalIncome',           tx.total_income,
    'totalExpenses',         tx.total_expenses
  )
  FROM agg, tx;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
