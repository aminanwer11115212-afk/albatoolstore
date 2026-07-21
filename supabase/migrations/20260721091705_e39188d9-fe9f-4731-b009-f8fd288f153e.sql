
-- ============================================================
-- Batch 1: unified edit for payments & customer charges.
-- All admin-only. All wrap invoice payment consistency check.
-- ============================================================

-- 1) revise_invoice_payment — richer overload (adds method, account, date, ref_no, note)
CREATE OR REPLACE FUNCTION public.revise_invoice_payment(
  _tx_id uuid,
  _new_amount numeric,
  _new_discount numeric DEFAULT NULL,
  _new_method text DEFAULT NULL,
  _new_account_id uuid DEFAULT NULL,
  _new_date date DEFAULT NULL,
  _new_reference_no text DEFAULT NULL,
  _new_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx           record;
  v_inv          record;
  v_invoice_id   uuid;
  v_old_amount   numeric;
  v_old_account  uuid;
  v_pay_delta    numeric;
  v_old_discount numeric;
  v_new_discount numeric;
  v_disc_delta   numeric := 0;
  v_new_total    numeric;
  v_new_paid     numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized_admin_only');
  END IF;
  IF _tx_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_tx_id'); END IF;
  IF _new_amount IS NULL OR _new_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  SELECT id, customer_id, account_id, amount, method, category, reference_id, description, date, allocation
    INTO v_tx FROM public.transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'tx_not_found'); END IF;
  IF v_tx.category <> 'customer_payment' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_payment');
  END IF;
  IF COALESCE(v_tx.method, '') = 'credit_balance' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'credit_consumption_not_editable');
  END IF;
  IF v_tx.reference_id IS NULL OR v_tx.reference_id !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_linked_invoice');
  END IF;
  v_invoice_id := v_tx.reference_id::uuid;
  v_old_account := v_tx.account_id;

  SELECT id, invoice_number, COALESCE(total,0) AS total,
         COALESCE(paid_amount,0) AS paid_amount, COALESCE(discount,0) AS discount,
         COALESCE(status,'') AS status
    INTO v_inv FROM public.invoices WHERE id = v_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found'); END IF;
  IF v_inv.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_cancelled');
  END IF;

  v_old_amount   := COALESCE(v_tx.amount, 0);
  v_pay_delta    := _new_amount - v_old_amount;
  v_old_discount := v_inv.discount;

  IF _new_discount IS NOT NULL THEN
    IF _new_discount < 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_discount'); END IF;
    v_new_discount := _new_discount;
    v_disc_delta   := v_new_discount - v_old_discount;
    v_new_total    := GREATEST(v_inv.total - v_disc_delta, 0);
  ELSE
    v_new_discount := v_old_discount;
    v_new_total    := v_inv.total;
  END IF;

  v_new_paid := v_inv.paid_amount + v_pay_delta;
  IF v_new_paid < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paid_would_be_negative');
  END IF;
  IF v_new_paid > v_new_total + 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'would_overpay',
      'new_total', v_new_total, 'new_paid', v_new_paid);
  END IF;

  UPDATE public.transactions
     SET amount = _new_amount,
         credit = _new_amount,
         method = COALESCE(NULLIF(_new_method,''), method),
         account_id = COALESCE(_new_account_id, account_id),
         date = COALESCE(_new_date, date),
         description = COALESCE(NULLIF(v_tx.description,''), 'دفعة على الفاتورة ' || COALESCE(v_inv.invoice_number, v_invoice_id::text))
                     || ' — عُدِّلت (' || v_old_amount::text || ' → ' || _new_amount::text || ')'
                     || CASE WHEN _new_reference_no IS NOT NULL AND _new_reference_no <> ''
                             THEN ' — رقم العملية: ' || _new_reference_no ELSE '' END,
         allocation = COALESCE(allocation, '{}'::jsonb) || jsonb_build_object(
           'revised', true,
           'revised_at', now(),
           'revised_by', auth.uid(),
           'amount_before', v_old_amount,
           'amount_after', _new_amount,
           'method_before', v_tx.method,
           'method_after', COALESCE(NULLIF(_new_method,''), v_tx.method),
           'account_before', v_tx.account_id,
           'account_after', COALESCE(_new_account_id, v_tx.account_id),
           'reference_no', _new_reference_no,
           'note', _new_note
         )
   WHERE id = _tx_id;

  UPDATE public.invoices
     SET paid_amount = v_new_paid,
         discount = v_new_discount,
         total = v_new_total,
         updated_at = now()
   WHERE id = v_invoice_id;

  IF v_tx.customer_id IS NOT NULL THEN
    PERFORM public.recompute_customer_balance(v_tx.customer_id);
  END IF;
  IF v_old_account IS NOT NULL THEN PERFORM public.recompute_account_balance(v_old_account); END IF;
  IF _new_account_id IS NOT NULL AND _new_account_id <> COALESCE(v_old_account, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM public.recompute_account_balance(_new_account_id);
  END IF;

  PERFORM public.assert_invoice_payment_consistency(v_invoice_id);

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', _tx_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_tx.customer_id,
    'amount_before', v_old_amount,
    'amount_after', _new_amount,
    'discount_before', v_old_discount,
    'discount_after', v_new_discount,
    'total_before', v_inv.total,
    'total_after', v_new_total,
    'paid_before', v_inv.paid_amount,
    'paid_after', v_new_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revise_invoice_payment(uuid, numeric, numeric, text, uuid, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_invoice_payment(uuid, numeric, numeric, text, uuid, date, text, text) TO authenticated, service_role;

-- 2) cancel_invoice_payment — full reversal (deletes the tx, reduces paid_amount)
CREATE OR REPLACE FUNCTION public.cancel_invoice_payment(
  _tx_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx  record;
  v_inv record;
  v_invoice_id uuid;
  v_new_paid numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized_admin_only');
  END IF;
  IF _tx_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_tx_id'); END IF;

  SELECT id, customer_id, account_id, amount, method, category, reference_id
    INTO v_tx FROM public.transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'tx_not_found'); END IF;
  IF v_tx.category <> 'customer_payment' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_payment');
  END IF;
  IF COALESCE(v_tx.method,'') = 'credit_balance' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'credit_consumption_not_cancellable');
  END IF;

  IF v_tx.reference_id IS NOT NULL AND v_tx.reference_id ~ '^[0-9a-fA-F-]{36}$' THEN
    v_invoice_id := v_tx.reference_id::uuid;
    SELECT id, invoice_number, COALESCE(total,0) AS total, COALESCE(paid_amount,0) AS paid_amount,
           COALESCE(status,'') AS status
      INTO v_inv FROM public.invoices WHERE id = v_invoice_id FOR UPDATE;
    IF FOUND AND v_inv.status <> 'cancelled' THEN
      v_new_paid := GREATEST(v_inv.paid_amount - COALESCE(v_tx.amount,0), 0);
      UPDATE public.invoices
         SET paid_amount = v_new_paid, updated_at = now()
       WHERE id = v_invoice_id;
    END IF;
  END IF;

  DELETE FROM public.transactions WHERE id = _tx_id;

  IF v_tx.customer_id IS NOT NULL THEN PERFORM public.recompute_customer_balance(v_tx.customer_id); END IF;
  IF v_tx.account_id  IS NOT NULL THEN PERFORM public.recompute_account_balance(v_tx.account_id); END IF;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM public.assert_invoice_payment_consistency(v_invoice_id);
  END IF;

  BEGIN
    INSERT INTO public.activity_log (action, entity_type, entity_id, details)
    VALUES ('cancel_invoice_payment', 'transaction', _tx_id,
            jsonb_build_object('reason', _reason, 'amount', v_tx.amount,
                               'invoice_id', v_invoice_id, 'invoice_number', v_inv.invoice_number,
                               'customer_id', v_tx.customer_id, 'at', now(), 'by', auth.uid()));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'tx_id', _tx_id, 'invoice_id', v_invoice_id,
    'invoice_number', v_inv.invoice_number, 'amount_cancelled', v_tx.amount,
    'paid_after', v_new_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invoice_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_payment(uuid, text) TO authenticated, service_role;

-- 3) revise_customer_charge — revise a whole charge group (deposit only)
-- Refuses if any allocation.kind='invoice_alloc' rows exist in the group (charge partly consumed).
CREATE OR REPLACE FUNCTION public.revise_customer_charge(
  _group_id uuid,
  _new_amount numeric,
  _new_method text DEFAULT NULL,
  _new_account_id uuid DEFAULT NULL,
  _new_date date DEFAULT NULL,
  _new_reference_no text DEFAULT NULL,
  _new_note text DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_old_amount numeric := 0;
  v_old_method text;
  v_old_account uuid;
  v_old_date date;
  v_consumed int := 0;
  v_alloc jsonb;
  v_reverse jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized_admin_only');
  END IF;
  IF _group_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_group_id'); END IF;
  IF _new_amount IS NULL OR _new_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  -- gather group metadata (from any row) and enforce no consumption
  SELECT COUNT(*) FILTER (WHERE (allocation->>'kind') = 'invoice_alloc'),
         (array_agg(customer_id))[1],
         COALESCE(SUM(amount) FILTER (WHERE category = 'customer_credit' AND amount > 0), 0),
         (array_agg(method))[1],
         (array_agg(account_id))[1],
         (array_agg(date))[1]
    INTO v_consumed, v_customer_id, v_old_amount, v_old_method, v_old_account, v_old_date
    FROM public.transactions
   WHERE (allocation->>'group_id')::uuid = _group_id;

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'group_not_found');
  END IF;
  IF v_consumed > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'charge_partly_consumed',
      'hint', 'ألغِ استهلاك الرصيد على الفواتير أولاً ثم أعد المحاولة');
  END IF;

  -- reverse existing group (safe: nothing consumed)
  v_reverse := public.reverse_customer_charge(_group_id);
  IF NOT COALESCE((v_reverse->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reverse_failed', 'details', v_reverse);
  END IF;

  -- re-allocate with new params
  v_alloc := public.allocate_customer_charge(
    v_customer_id,
    _new_amount,
    COALESCE(_new_date, v_old_date, CURRENT_DATE),
    COALESCE(NULLIF(_new_method,''), v_old_method, 'cash'),
    COALESCE(_new_account_id, v_old_account),
    _new_reference_no,
    _new_note
  );

  BEGIN
    INSERT INTO public.activity_log (action, entity_type, entity_id, details)
    VALUES ('revise_customer_charge', 'transaction_group', _group_id,
            jsonb_build_object('reason', _reason,
                               'customer_id', v_customer_id,
                               'amount_before', v_old_amount, 'amount_after', _new_amount,
                               'method_after', _new_method, 'account_after', _new_account_id,
                               'date_after', _new_date, 'reference_no', _new_reference_no,
                               'new_group', v_alloc->'group_id',
                               'at', now(), 'by', auth.uid()));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'old_group_id', _group_id,
    'customer_id', v_customer_id,
    'amount_before', v_old_amount,
    'amount_after', _new_amount,
    'reallocation', v_alloc
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revise_customer_charge(uuid, numeric, text, uuid, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_customer_charge(uuid, numeric, text, uuid, date, text, text, text) TO authenticated, service_role;

-- 4) cancel_customer_charge — thin admin wrapper over reverse_customer_charge (logs reason)
CREATE OR REPLACE FUNCTION public.cancel_customer_charge(
  _group_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized_admin_only');
  END IF;
  v_res := public.reverse_customer_charge(_group_id);
  BEGIN
    INSERT INTO public.activity_log (action, entity_type, entity_id, details)
    VALUES ('cancel_customer_charge', 'transaction_group', _group_id,
            jsonb_build_object('reason', _reason, 'result', v_res,
                               'at', now(), 'by', auth.uid()));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_customer_charge(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_customer_charge(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
