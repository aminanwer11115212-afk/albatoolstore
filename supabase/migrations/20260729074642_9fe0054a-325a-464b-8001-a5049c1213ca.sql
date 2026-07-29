ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS auto_settle_credit_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.auto_settle_customer_credit(
  _customer_id uuid,
  _source_kind text DEFAULT 'manual_charge',      -- 'invoice_overpay' | 'manual_charge'
  _source_ref text DEFAULT NULL,
  _exclude_invoice_id uuid DEFAULT NULL,
  _date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled  boolean;
  v_order    text;
  v_credit   numeric := 0;
  v_left     numeric := 0;
  v_items    jsonb := '[]'::jsonb;
  v_apply    numeric;
  v_res      jsonb;
  v_group    uuid;
  v_src_num  text;
  r          record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT COALESCE(auto_settle_credit_enabled, true),
         COALESCE(NULLIF(credit_consumption_order, ''), 'fifo')
    INTO v_enabled, v_order
    FROM public.company_settings
   ORDER BY created_at NULLS LAST
   LIMIT 1;
  v_enabled := COALESCE(v_enabled, true);
  v_order := CASE WHEN v_order = 'lifo' THEN 'lifo' ELSE 'fifo' END;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;

  SELECT COALESCE(credit_balance, 0) INTO v_credit
    FROM public.customers WHERE id = _customer_id;
  IF v_credit IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;
  IF v_credit <= 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_credit_available');
  END IF;

  v_left := v_credit;

  FOR r IN
    SELECT id, invoice_number,
           GREATEST(COALESCE(total, 0) - COALESCE(paid_amount, 0), 0) AS remaining
      FROM public.invoices
     WHERE customer_id = _customer_id
       AND COALESCE(status, '') <> 'cancelled'
       AND COALESCE(source, '') <> 'pos'
       AND COALESCE(total, 0) - COALESCE(paid_amount, 0) > 0.01
       AND (_exclude_invoice_id IS NULL OR id <> _exclude_invoice_id)
     ORDER BY
       CASE WHEN v_order = 'fifo' THEN date END ASC NULLS LAST,
       CASE WHEN v_order = 'fifo' THEN created_at END ASC,
       CASE WHEN v_order = 'lifo' THEN date END DESC NULLS LAST,
       CASE WHEN v_order = 'lifo' THEN created_at END DESC
  LOOP
    EXIT WHEN v_left <= 0.01;
    v_apply := ROUND(LEAST(v_left, r.remaining), 2);
    CONTINUE WHEN v_apply <= 0.01;
    v_items := v_items || jsonb_build_array(jsonb_build_object('invoice_id', r.id, 'amount', v_apply));
    v_left := ROUND(v_left - v_apply, 2);
  END LOOP;

  IF jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_open_invoices', 'credit_available', v_credit);
  END IF;

  v_res := public.settle_invoices_from_credit(_customer_id, v_items, COALESCE(_date, CURRENT_DATE));
  IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'settle_failed', 'details', v_res);
  END IF;

  v_group := (v_res->>'settle_group')::uuid;

  IF _source_kind = 'invoice_overpay' AND _source_ref IS NOT NULL THEN
    BEGIN
      SELECT invoice_number INTO v_src_num FROM public.invoices WHERE id = _source_ref::uuid;
    EXCEPTION WHEN OTHERS THEN v_src_num := NULL;
    END;
  END IF;

  -- وسم قيود هذه المجموعة بمصدر التسوية كي تُعرض للعميل
  UPDATE public.transactions
     SET allocation = COALESCE(allocation, '{}'::jsonb) || jsonb_build_object(
           'auto', true,
           'source_kind', _source_kind,
           'source_ref', _source_ref,
           'source_invoice_number', v_src_num,
           'source_date', COALESCE(_date, CURRENT_DATE)
         )
   WHERE (allocation->>'settle_group')::uuid = v_group;

  -- توثيق كل فاتورة مُسوّاة في سجل المراجعات
  BEGIN
    FOR r IN SELECT * FROM jsonb_array_elements(v_res->'results') AS e(value) LOOP
      IF COALESCE((r.value->>'skipped')::boolean, false) THEN CONTINUE; END IF;
      INSERT INTO public.invoice_revisions (invoice_id, action, changes, note)
      VALUES (
        (r.value->>'invoice_id')::uuid,
        'auto_settle',
        jsonb_build_object(
          'auto', true,
          'applied', (r.value->>'applied')::numeric,
          'paid_before', (r.value->>'paid_before')::numeric,
          'paid_after', (r.value->>'paid_after')::numeric,
          'new_status', r.value->>'new_status',
          'source_kind', _source_kind,
          'source_ref', _source_ref,
          'source_invoice_number', v_src_num,
          'settle_group', v_group
        ),
        CASE WHEN _source_kind = 'invoice_overpay'
             THEN 'تسوية تلقائية من فائض دفعة الفاتورة ' || COALESCE(v_src_num, '')
             ELSE 'تسوية تلقائية من شحن رصيد بتاريخ ' || COALESCE(_date, CURRENT_DATE)::text
        END
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'auto', true,
    'order', v_order,
    'source_kind', _source_kind,
    'source_ref', _source_ref,
    'source_invoice_number', v_src_num,
    'settle_group', v_group,
    'applied_total', v_res->'applied_total',
    'credit_left', GREATEST(v_left, 0),
    'results', v_res->'results'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_settle_customer_credit(uuid, text, text, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_settle_customer_credit(uuid, text, text, uuid, date) TO authenticated, service_role;

-- شحن الرصيد يُشغّل التسوية التلقائية في نفس المعاملة
CREATE OR REPLACE FUNCTION public.record_customer_charge(
  _customer_id  uuid,
  _amount       numeric,
  _date         date,
  _method       text,
  _account_id   uuid,
  _reference_no text,
  _notes        text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := COALESCE(_amount, 0);
  v_group  uuid := gen_random_uuid();
  v_desc   text;
  v_cust   uuid;
  v_auto   jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _customer_id IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT id INTO v_cust FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF v_cust IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;

  v_desc := 'شحن رصيد عميل'
         || COALESCE(' - ' || NULLIF(_notes, ''), '')
         || CASE WHEN _reference_no IS NOT NULL AND _reference_no <> ''
                 THEN ' - رقم العملية: ' || _reference_no ELSE '' END;

  INSERT INTO public.transactions
    (type, category, amount, credit, date, method, customer_id, account_id, reference_no, description, allocation)
  VALUES
    ('income', 'customer_credit', v_amount, v_amount, _date, _method, _customer_id, _account_id,
     NULLIF(_reference_no, ''),
     v_desc,
     jsonb_build_object('group_id', v_group, 'kind', 'surplus', 'amount', v_amount, 'stored_only', true));

  PERFORM public.recompute_customer_balance(_customer_id);
  IF _account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(_account_id);
  END IF;

  v_auto := public.auto_settle_customer_credit(
    _customer_id, 'manual_charge', v_group::text, NULL, COALESCE(_date, CURRENT_DATE));

  RETURN jsonb_build_object(
    'ok', true,
    'group_id', v_group,
    'total', v_amount,
    'allocated', COALESCE((v_auto->>'applied_total')::numeric, 0),
    'surplus', v_amount,
    'credited', v_amount,
    'auto_settlement', v_auto,
    'allocations', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';