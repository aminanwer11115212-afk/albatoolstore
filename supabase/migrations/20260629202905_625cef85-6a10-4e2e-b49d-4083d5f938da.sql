
CREATE OR REPLACE FUNCTION public.get_customer_balance_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_debt numeric := 0;
  v_total_credit numeric := 0;
  v_debtors int := 0;
  v_creditors int := 0;
  v_count int := 0;
  v_top jsonb := '[]'::jsonb;
BEGIN
  SELECT
    COALESCE(SUM(GREATEST(COALESCE(balance,0), 0)), 0),
    COALESCE(SUM(GREATEST(COALESCE(credit_balance,0), 0)), 0),
    COUNT(*) FILTER (WHERE COALESCE(balance,0) > 0.01),
    COUNT(*) FILTER (WHERE COALESCE(credit_balance,0) > 0.01),
    COUNT(*)
  INTO v_total_debt, v_total_credit, v_debtors, v_creditors, v_count
  FROM public.customers;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top
  FROM (
    SELECT id,
           name,
           COALESCE(balance,0)         AS debt,
           COALESCE(credit_balance,0)  AS credit,
           COALESCE(balance,0) - COALESCE(credit_balance,0) AS net
    FROM public.customers
    WHERE COALESCE(balance,0) > 0.01
    ORDER BY COALESCE(balance,0) DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'total_debt',   v_total_debt,
    'total_credit', v_total_credit,
    'debtors',      v_debtors,
    'creditors',    v_creditors,
    'count',        v_count,
    'net',          v_total_debt - v_total_credit,
    'top_debtors',  v_top
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_balance_stats() TO authenticated, service_role;
