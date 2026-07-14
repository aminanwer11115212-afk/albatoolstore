CREATE OR REPLACE FUNCTION public.admin_reset_transactional_data(_scope jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    DELETE FROM public.invoice_items WHERE invoice_id IS NOT NULL; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('invoice_items', v_n);
    DELETE FROM public.invoices_packaging_items WHERE invoice_id IS NOT NULL;
    DELETE FROM public.invoices_transports_items WHERE invoice_transport_id IS NOT NULL;
    DELETE FROM public.invoice_packaging WHERE invoice_id IS NOT NULL;
    DELETE FROM public.invoice_transports WHERE invoice_id IS NOT NULL;
    DELETE FROM public.invoice_revisions WHERE invoice_id IS NOT NULL;
    DELETE FROM public.invoice_attachments WHERE invoice_id IS NOT NULL;
    DELETE FROM public.deleted_invoice_items WHERE invoice_id IS NOT NULL;
    DELETE FROM public.transactions WHERE reference_id IN (SELECT id::text FROM public.invoices);
    DELETE FROM public.invoices WHERE id IS NOT NULL; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('invoices', v_n);
  END IF;

  IF v_quotes THEN
    DELETE FROM public.quote_items WHERE quote_id IS NOT NULL;
    DELETE FROM public.quote_transports WHERE quote_id IS NOT NULL;
    DELETE FROM public.quotes_packaging_items WHERE quote_id IS NOT NULL;
    DELETE FROM public.quotes_packaging WHERE quote_id IS NOT NULL;
    DELETE FROM public.quote_attachments WHERE quote_id IS NOT NULL;
    DELETE FROM public.deleted_quote_items WHERE quote_id IS NOT NULL;
    DELETE FROM public.quotes WHERE id IS NOT NULL; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('quotes', v_n);
  END IF;

  IF v_purchases THEN
    DELETE FROM public.purchase_order_items WHERE purchase_order_id IS NOT NULL;
    DELETE FROM public.purchase_attachments WHERE purchase_order_id IS NOT NULL;
    DELETE FROM public.transactions WHERE category = 'supplier_payment';
    DELETE FROM public.purchase_orders WHERE id IS NOT NULL; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('purchase_orders', v_n);
  END IF;

  IF v_bank THEN
    DELETE FROM public.transactions WHERE id IS NOT NULL; GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('transactions', v_n);
    UPDATE public.accounts SET balance = 0, updated_at = now() WHERE id IS NOT NULL;
  END IF;

  IF v_customers THEN
    UPDATE public.customers SET balance = 0, credit_balance = 0, updated_at = now() WHERE id IS NOT NULL;
    UPDATE public.suppliers SET balance = 0, updated_at = now() WHERE id IS NOT NULL;
    v_result := v_result || jsonb_build_object('customers_reset', true);
  END IF;

  PERFORM public.recompute_customer_balance(id) FROM public.customers;
  PERFORM public.recompute_supplier_balance(id) FROM public.suppliers;
  PERFORM public.recompute_account_balance(id) FROM public.accounts;

  RETURN jsonb_build_object('ok', true, 'at', now(), 'scope', _scope, 'counts', v_result);
END;
$function$;