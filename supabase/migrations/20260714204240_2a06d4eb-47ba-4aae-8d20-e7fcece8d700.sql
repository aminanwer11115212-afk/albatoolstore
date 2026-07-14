CREATE OR REPLACE FUNCTION public.recalc_all_account_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  PERFORM public.recompute_account_balance(id) FROM public.accounts;
  SELECT COUNT(*) INTO v_count FROM public.accounts;
  RETURN jsonb_build_object('ok', true, 'recalculated', v_count, 'at', now());
END; $$;

CREATE OR REPLACE FUNCTION public.recalc_all_supplier_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  PERFORM public.recompute_supplier_balance(id) FROM public.suppliers;
  SELECT COUNT(*) INTO v_count FROM public.suppliers;
  RETURN jsonb_build_object('ok', true, 'recalculated', v_count, 'at', now());
END; $$;

GRANT EXECUTE ON FUNCTION public.recalc_all_account_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_all_supplier_balances() TO authenticated;