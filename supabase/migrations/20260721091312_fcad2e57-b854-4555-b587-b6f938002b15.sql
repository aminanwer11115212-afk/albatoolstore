CREATE OR REPLACE FUNCTION public.allocate_customer_charge(
  _customer_id uuid,
  _amount numeric,
  _date date,
  _method text,
  _account_id uuid,
  _reference_no text,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left numeric := COALESCE(_amount, 0);
  v_group uuid := gen_random_uuid();
  v_alloc jsonb := '[]'::jsonb;
  v_surplus numeric := 0;
  v_allocated numeric := 0;
  r record;
  v_apply numeric;
  v_new_paid numeric;
  v_new_status text;
  v_desc text;
BEGIN
  IF _customer_id IS NULL OR v_left <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  v_desc := 'شحن رصيد عميل'
         || COALESCE(' - ' || NULLIF(_notes, ''), '')
         || CASE WHEN _reference_no IS NOT NULL AND _reference_no <> ''
                 THEN ' - رقم العملية: ' || _reference_no ELSE '' END;

  FOR r IN
    SELECT id, invoice_number, total, paid_amount, date
      FROM public.invoices
     WHERE customer_id = _customer_id
       AND COALESCE(status, '') <> 'cancelled'
       AND COALESCE(source, '') <> 'pos'
       AND COALESCE(total, 0) - COALESCE(paid_amount, 0) > 0.01
     ORDER BY date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0.01;
    v_apply := LEAST(v_left, GREATEST(COALESCE(r.total, 0) - COALESCE(r.paid_amount, 0), 0));
    IF v_apply <= 0.01 THEN CONTINUE; END IF;

    v_new_paid := COALESCE(r.paid_amount, 0) + v_apply;
    v_new_status := CASE
      WHEN COALESCE(r.total, 0) > 0 AND v_new_paid >= COALESCE(r.total, 0) - 0.01 THEN 'paid'
      WHEN v_new_paid > 0.01 THEN 'partial'
      ELSE 'pending'
    END;

    UPDATE public.invoices
       SET paid_amount = v_new_paid,
           status = v_new_status,
           updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.transactions
      (type, category, amount, credit, date, method, customer_id, account_id, reference_id, reference_no, description, allocation)
    VALUES
      ('income', 'customer_payment', v_apply, v_apply, _date, _method, _customer_id, _account_id, r.id::text,
       NULLIF(_reference_no, ''),
       v_desc || ' → فاتورة ' || r.invoice_number,
       jsonb_build_object(
         'group_id', v_group,
         'kind', 'invoice_alloc',
         'invoice_id', r.id,
         'invoice_number', r.invoice_number,
         'invoice_date', r.date,
         'invoice_total', COALESCE(r.total, 0),
         'applied', v_apply,
         'paid_before', COALESCE(r.paid_amount, 0),
         'paid_after', v_new_paid,
         'remaining_after', GREATEST(COALESCE(r.total, 0) - v_new_paid, 0),
         'new_status', v_new_status
       )
      );

    v_alloc := v_alloc || jsonb_build_array(jsonb_build_object(
      'invoice_id', r.id,
      'invoice_number', r.invoice_number,
      'invoice_date', r.date,
      'invoice_total', COALESCE(r.total, 0),
      'applied', v_apply,
      'remaining_after', GREATEST(COALESCE(r.total, 0) - v_new_paid, 0),
      'new_status', v_new_status
    ));
    v_left := v_left - v_apply;
    v_allocated := v_allocated + v_apply;
  END LOOP;

  v_surplus := GREATEST(v_left, 0);
  IF v_surplus > 0.01 THEN
    INSERT INTO public.transactions
      (type, category, amount, credit, date, method, customer_id, account_id, reference_no, description, allocation)
    VALUES
      ('income', 'customer_credit', v_surplus, v_surplus, _date, _method, _customer_id, _account_id,
       NULLIF(_reference_no, ''),
       v_desc || ' - رصيد فائض',
       jsonb_build_object('group_id', v_group, 'kind', 'surplus', 'amount', v_surplus)
      );
  END IF;

  PERFORM public.recompute_customer_balance(_customer_id);
  IF _account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(_account_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'group_id', v_group,
    'total', COALESCE(_amount, 0),
    'allocated', v_allocated,
    'surplus', v_surplus,
    'allocations', v_alloc
  );
END;
$$;