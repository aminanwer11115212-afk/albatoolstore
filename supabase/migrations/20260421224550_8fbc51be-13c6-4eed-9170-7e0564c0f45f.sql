
CREATE OR REPLACE FUNCTION public.get_cloud_usage_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_db_size bigint;
  v_tables jsonb;
  v_storage_bytes bigint;
  v_storage_count bigint;
  v_total_rows bigint;
  v_recent_invoices_30d bigint;
  v_recent_invoices_7d jsonb;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_size;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC), '[]'::jsonb)
    INTO v_tables
  FROM (
    SELECT jsonb_build_object(
      'table_name', relname,
      'size_bytes', pg_total_relation_size(c.oid),
      'row_estimate', GREATEST(reltuples::bigint, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 20
  ) sub;

  SELECT COALESCE(SUM(GREATEST(reltuples::bigint, 0)), 0) INTO v_total_rows
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  BEGIN
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0), COUNT(*)
      INTO v_storage_bytes, v_storage_count
    FROM storage.objects;
  EXCEPTION WHEN OTHERS THEN
    v_storage_bytes := 0;
    v_storage_count := 0;
  END;

  SELECT COUNT(*) INTO v_recent_invoices_30d
  FROM public.invoices WHERE created_at >= now() - interval '30 days';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', cnt) ORDER BY day), '[]'::jsonb)
    INTO v_recent_invoices_7d
  FROM (
    SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS cnt
    FROM public.invoices
    WHERE created_at >= now() - interval '7 days'
    GROUP BY 1
    ORDER BY 1
  ) s;

  RETURN jsonb_build_object(
    'db_size_bytes', v_db_size,
    'tables', v_tables,
    'total_rows', v_total_rows,
    'storage_bytes', v_storage_bytes,
    'storage_count', v_storage_count,
    'invoices_last_30d', v_recent_invoices_30d,
    'invoices_last_7d', v_recent_invoices_7d,
    'measured_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cloud_usage_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_cloud_usage_stats() TO authenticated;
