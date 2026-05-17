CREATE OR REPLACE FUNCTION public.get_customer_balance_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_debt numeric := 0;
  v_total_credit numeric := 0;
  v_debtors integer := 0;
  v_creditors integer := 0;
  v_count integer := 0;
  v_top_debtors jsonb;
BEGIN
  SELECT
    COALESCE(SUM(GREATEST(COALESCE(balance,0), 0)), 0),
    COALESCE(SUM(GREATEST(COALESCE(credit_balance,0), 0)), 0),
    COUNT(*) FILTER (WHERE COALESCE(balance,0) > 0),
    COUNT(*) FILTER (WHERE COALESCE(credit_balance,0) > 0),
    COUNT(*)
  INTO v_total_debt, v_total_credit, v_debtors, v_creditors, v_count
  FROM public.customers;

  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'debt')::numeric DESC), '[]'::jsonb)
    INTO v_top_debtors
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'name', name,
      'debt', COALESCE(balance,0),
      'credit', COALESCE(credit_balance,0),
      'net', COALESCE(balance,0) - COALESCE(credit_balance,0)
    ) AS t
    FROM public.customers
    WHERE COALESCE(balance,0) > 0
    ORDER BY COALESCE(balance,0) DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'total_debt', v_total_debt,
    'total_credit', v_total_credit,
    'debtors', v_debtors,
    'creditors', v_creditors,
    'count', v_count,
    'net', v_total_debt - v_total_credit,
    'top_debtors', v_top_debtors,
    'computed_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_balance_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_balance_stats() TO authenticated;