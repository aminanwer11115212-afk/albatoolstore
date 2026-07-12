
-- 1) recompute_customer_balance: استثناء POS والفواتير الملغاة
CREATE OR REPLACE FUNCTION public.recompute_customer_balance(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_balance numeric; v_credit numeric;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)), 0)
    INTO v_balance
    FROM public.invoices
    WHERE customer_id = _customer_id
      AND COALESCE(status,'') <> 'cancelled'
      AND COALESCE(source,'') <> 'pos';
  SELECT COALESCE(SUM(COALESCE(amount,0)), 0) INTO v_credit
    FROM public.transactions
    WHERE customer_id = _customer_id AND category = 'customer_credit';
  UPDATE public.customers
    SET balance = v_balance, credit_balance = v_credit, updated_at = now()
    WHERE id = _customer_id;
END; $$;

-- 2) recalc_all_customer_balances: يعتمد على النسخة الموحّدة أعلاه
CREATE OR REPLACE FUNCTION public.recalc_all_customer_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  PERFORM public.recompute_customer_balance(id) FROM public.customers;
  SELECT COUNT(*) INTO v_count FROM public.customers;
  RETURN jsonb_build_object('ok', true, 'recalculated', v_count, 'at', now());
END; $$;

-- 3) عمود صافي واحد كمصدر حقيقة موحّد للعرض
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS net_balance numeric
  GENERATED ALWAYS AS (COALESCE(balance,0) - COALESCE(credit_balance,0)) STORED;

-- 4) إعادة حساب أرصدة كل العملاء لتطابق المنطق الجديد فوراً
SELECT public.recompute_customer_balance(id) FROM public.customers;
