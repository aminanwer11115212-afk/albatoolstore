-- ============================================================
-- استرجاع جزء من دفعة فاتورة وتحويله إلى رصيد دائن للعميل، ذرّياً.
-- الأثر: paid_amount للفاتورة يقلّ بمقدار الاسترجاع، ويُضاف قيد
-- customer_credit موجب بنفس المقدار → رصيد العميل الصافي لا يتغيّر
-- (الدين يعود، والرصيد الدائن يزيد بنفس المقدار).
-- ============================================================
CREATE OR REPLACE FUNCTION public.refund_payment_to_customer_credit(
  _tx_id uuid,
  _refund_amount numeric,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx         record;
  v_inv        record;
  v_invoice_id uuid;
  v_new_amount numeric;
  v_new_paid   numeric;
  v_group      uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _tx_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_tx_id');
  END IF;
  IF _refund_amount IS NULL OR _refund_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  SELECT id, customer_id, account_id, amount, method, category, reference_id, description, date
    INTO v_tx
    FROM public.transactions
   WHERE id = _tx_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tx_not_found');
  END IF;
  IF v_tx.category <> 'customer_payment' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_payment');
  END IF;
  IF COALESCE(v_tx.method, '') = 'credit_balance' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'credit_consumption_not_refundable');
  END IF;
  IF v_tx.customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_customer');
  END IF;
  IF _refund_amount > COALESCE(v_tx.amount, 0) + 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'refund_exceeds_payment',
      'payment_amount', COALESCE(v_tx.amount, 0));
  END IF;

  v_new_amount := GREATEST(COALESCE(v_tx.amount, 0) - _refund_amount, 0);

  -- إن كانت الدفعة مرتبطة بفاتورة، خفّض paid_amount بمقدار الاسترجاع.
  IF v_tx.reference_id IS NOT NULL AND v_tx.reference_id ~ '^[0-9a-fA-F-]{36}$' THEN
    v_invoice_id := v_tx.reference_id::uuid;
    SELECT id, invoice_number, COALESCE(total,0) AS total,
           COALESCE(paid_amount,0) AS paid_amount, COALESCE(status,'') AS status
      INTO v_inv
      FROM public.invoices
     WHERE id = v_invoice_id
     FOR UPDATE;
    IF FOUND AND v_inv.status <> 'cancelled' THEN
      v_new_paid := GREATEST(v_inv.paid_amount - _refund_amount, 0);
      UPDATE public.invoices
         SET paid_amount = v_new_paid,
             updated_at  = now()
       WHERE id = v_invoice_id;
    END IF;
  END IF;

  -- (1) قلّل مبلغ الدفعة الأصلية مع ختم تدقيقي في allocation.
  UPDATE public.transactions
     SET amount = v_new_amount,
         credit = v_new_amount,
         description = COALESCE(NULLIF(v_tx.description, ''), 'دفعة عميل')
                     || ' — استُرجع منها ' || _refund_amount::text || ' إلى الرصيد الدائن',
         allocation = COALESCE(allocation, '{}'::jsonb) || jsonb_build_object(
           'refunded_to_credit', true,
           'refunded_at', now(),
           'refund_amount', _refund_amount,
           'refund_group', v_group,
           'amount_before', COALESCE(v_tx.amount, 0),
           'amount_after', v_new_amount
         )
   WHERE id = _tx_id;

  -- (2) قيد customer_credit موجب بنفس المقدار → رصيد دائن يستخدمه العميل لاحقاً.
  INSERT INTO public.transactions
    (type, category, amount, credit, date, method, customer_id, account_id, description, allocation)
  VALUES
    ('income', 'customer_credit', _refund_amount, _refund_amount,
     COALESCE(v_tx.date, CURRENT_DATE),
     v_tx.method, v_tx.customer_id, v_tx.account_id,
     'استرجاع من دفعة → رصيد دائن'
       || COALESCE(' — ' || NULLIF(_note, ''), '')
       || COALESCE(' (فاتورة ' || v_inv.invoice_number || ')', ''),
     jsonb_build_object(
       'kind', 'refund_credit',
       'source_tx', _tx_id,
       'refund_group', v_group,
       'invoice_id', v_invoice_id
     )
    );

  -- (3) إعادة حساب الأرصدة صراحةً (triggers ستفعل ذلك أيضاً — نستدعي للتأكيد).
  PERFORM public.recompute_customer_balance(v_tx.customer_id);
  IF v_tx.account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(v_tx.account_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', _tx_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_tx.customer_id,
    'refunded', _refund_amount,
    'payment_amount_before', COALESCE(v_tx.amount, 0),
    'payment_amount_after', v_new_amount,
    'refund_group', v_group
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_payment_to_customer_credit(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_payment_to_customer_credit(uuid, numeric, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';