
CREATE OR REPLACE FUNCTION public.admin_reset_stock_and_ledgers(_scope jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_stock boolean := COALESCE((_scope->>'stock')::boolean, false);
  v_ledger boolean := COALESCE((_scope->>'ledger')::boolean, false);
  v_result jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 1) تصفير كميات كل المنتجات
  IF v_stock THEN
    UPDATE public.products
       SET stock_quantity = 0,
           updated_at = now()
     WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('products_zeroed', v_n);
  END IF;

  -- 2) تصفير كشف حساب العملاء بالكامل عبر النظام:
  --    - حذف حركات customer_payment / customer_credit
  --    - تعليم كل الفواتير غير الملغاة كمدفوعة بالكامل حتى يصبح المتبقي = 0
  --    - إعادة حساب أرصدة العملاء (ستصبح 0)
  IF v_ledger THEN
    DELETE FROM public.transactions
     WHERE category IN ('customer_payment', 'customer_credit');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('customer_txs_deleted', v_n);

    UPDATE public.invoices
       SET paid_amount = COALESCE(total, 0),
           status = CASE WHEN COALESCE(status,'') = 'cancelled' THEN status ELSE 'paid' END,
           updated_at = now()
     WHERE COALESCE(source,'') <> 'pos';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('invoices_marked_paid', v_n);

    UPDATE public.customers
       SET balance = 0,
           credit_balance = 0,
           updated_at = now()
     WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('customers_zeroed', v_n);

    PERFORM public.recompute_customer_balance(id) FROM public.customers;
  END IF;

  RETURN jsonb_build_object('ok', true, 'at', now(), 'scope', _scope, 'counts', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_stock_and_ledgers(jsonb) TO authenticated;
