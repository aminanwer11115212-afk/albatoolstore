CREATE OR REPLACE FUNCTION public.delete_invoice_with_reconciliation(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_deleted_tx int := 0;
  v_account_ids uuid[] := ARRAY[]::uuid[];
  r record;
BEGIN
  IF _invoice_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_id');
  END IF;

  SELECT id, invoice_number, customer_id, COALESCE(paid_amount, 0) AS paid_amount
    INTO v_inv
    FROM public.invoices
    WHERE id = _invoice_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_inv.customer_id IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT account_id
        FROM public.transactions
       WHERE reference_id = _invoice_id::text
         AND category = 'customer_payment'
         AND customer_id = v_inv.customer_id
         AND account_id IS NOT NULL
    LOOP
      v_account_ids := array_append(v_account_ids, r.account_id);
    END LOOP;

    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_payment'
       AND customer_id = v_inv.customer_id;
    GET DIAGNOSTICS v_deleted_tx = ROW_COUNT;

    IF array_length(v_account_ids, 1) > 0 THEN
      FOR r IN SELECT unnest(v_account_ids) AS aid LOOP
        PERFORM public.recompute_account_balance(r.aid);
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_inv.customer_id,
    'paid_amount', v_inv.paid_amount,
    'deleted_payments', v_deleted_tx,
    'affected_accounts', COALESCE(array_length(v_account_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_with_reconciliation(uuid) TO authenticated, service_role;