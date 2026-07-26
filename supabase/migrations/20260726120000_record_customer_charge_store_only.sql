-- ============================================================
-- خطة جديدة لشحن رصيد العميل: التخزين كرصيد دائن فقط (بدون توزيع)
--
-- سابقاً كان `allocate_customer_charge` يوزّع الشحن تلقائياً على الفواتير
-- غير المسددة (FIFO) ويرفع paid_amount ويحوّل حالتها إلى «مسددة/جزئية».
-- المطلوب الآن: عند شحن رصيد للعميل لا يُوزَّع على الفواتير إطلاقاً، بل
-- يُخزَّن كاملاً كرصيد دائن (customer_credit) على مستوى العميل. ثم يُسدَّد
-- المتبقي يدوياً من نافذة كشف الحساب عبر `apply_customer_credit_to_invoice`.
--
-- هذه الدالة `record_customer_charge` هي المسار الوحيد الجديد للشحن.
-- تبقى `allocate_customer_charge` موجودة للتوافق مع أي بيانات/مسارات قديمة،
-- لكنها لم تعد تُستدعى من الواجهة.
-- ============================================================
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _customer_id IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- قفل صف العميل لتسلسل الشحنات المتزامنة ومنع سباق إعادة الحساب.
  SELECT id INTO v_cust FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF v_cust IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;

  v_desc := 'شحن رصيد عميل'
         || COALESCE(' - ' || NULLIF(_notes, ''), '')
         || CASE WHEN _reference_no IS NOT NULL AND _reference_no <> ''
                 THEN ' - رقم العملية: ' || _reference_no ELSE '' END;

  -- قيد رصيد دائن واحد بكامل المبلغ — لا يمسّ أي فاتورة.
  -- allocation.kind='surplus' كي يُصنَّف في الواجهة كـ «شحن يدوي» (creditSource.ts)
  -- ويظهر في سجل الشحن كرصيد دائن كامل غير موزّع.
  INSERT INTO public.transactions
    (type, category, amount, credit, date, method, customer_id, account_id, reference_no, description, allocation)
  VALUES
    ('income', 'customer_credit', v_amount, v_amount, _date, _method, _customer_id, _account_id,
     NULLIF(_reference_no, ''),
     v_desc,
     jsonb_build_object(
       'group_id', v_group,
       'kind', 'surplus',
       'amount', v_amount,
       'stored_only', true
     )
    );

  PERFORM public.recompute_customer_balance(_customer_id);
  IF _account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(_account_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'group_id', v_group,
    'total', v_amount,
    'allocated', 0,
    'surplus', v_amount,
    'credited', v_amount,
    'allocations', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) TO authenticated, service_role;

-- ============================================================
-- تعديل الشحنة: أعِد التخزين كرصيد دائن (بدون توزيع) بدل allocate_customer_charge.
-- تبقى نفس المواصفات، يتغيّر فقط مسار إعادة الإنشاء بعد العكس.
-- ============================================================
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

  -- إعادة التخزين كرصيد دائن فقط (لا توزيع على الفواتير)
  v_alloc := public.record_customer_charge(
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

NOTIFY pgrst, 'reload schema';
