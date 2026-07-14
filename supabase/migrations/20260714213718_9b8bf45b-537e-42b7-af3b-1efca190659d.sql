
CREATE OR REPLACE FUNCTION public.admin_reset_transactional_data(_scope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoices boolean := COALESCE((_scope->>'invoices')::boolean, false);
  v_quotes   boolean := COALESCE((_scope->>'quotes')::boolean, false);
  v_bank     boolean := COALESCE((_scope->>'bank')::boolean, false);
  v_customers boolean := COALESCE((_scope->>'customers')::boolean, false);
  v_purchases boolean := COALESCE((_scope->>'purchases')::boolean, false);
  v_result jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF v_invoices THEN
    DELETE FROM public.invoice_items; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('invoice_items', v_n);
    DELETE FROM public.invoice_packaging;
    DELETE FROM public.invoice_transports;
    DELETE FROM public.invoices_packaging_items;
    DELETE FROM public.invoices_transports_items;
    DELETE FROM public.invoice_revisions;
    DELETE FROM public.invoice_attachments;
    DELETE FROM public.deleted_invoice_items;
    DELETE FROM public.transactions WHERE reference_id IN (SELECT id::text FROM public.invoices);
    DELETE FROM public.invoices; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('invoices', v_n);
  END IF;

  IF v_quotes THEN
    DELETE FROM public.quote_items;
    DELETE FROM public.quote_transports;
    DELETE FROM public.quotes_packaging;
    DELETE FROM public.quotes_packaging_items;
    DELETE FROM public.quote_attachments;
    DELETE FROM public.deleted_quote_items;
    DELETE FROM public.quotes; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('quotes', v_n);
  END IF;

  IF v_purchases THEN
    DELETE FROM public.purchase_order_items;
    DELETE FROM public.purchase_attachments;
    DELETE FROM public.transactions WHERE category = 'supplier_payment';
    DELETE FROM public.purchase_orders; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('purchase_orders', v_n);
  END IF;

  IF v_bank THEN
    DELETE FROM public.transactions; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('transactions', v_n);
    UPDATE public.accounts SET balance = 0, updated_at = now();
  END IF;

  IF v_customers THEN
    UPDATE public.customers SET balance = 0, credit_balance = 0, updated_at = now();
    UPDATE public.suppliers SET balance = 0, updated_at = now();
    v_result := v_result || jsonb_build_object('customers_reset', true);
  END IF;

  -- Recompute everything to be safe
  PERFORM public.recompute_customer_balance(id) FROM public.customers;
  PERFORM public.recompute_supplier_balance(id) FROM public.suppliers;
  PERFORM public.recompute_account_balance(id) FROM public.accounts;

  RETURN jsonb_build_object('ok', true, 'at', now(), 'scope', _scope, 'counts', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_transactional_data(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_transactional_data(jsonb) TO authenticated;
