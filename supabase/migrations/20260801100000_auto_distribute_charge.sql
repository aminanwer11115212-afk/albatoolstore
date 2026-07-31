-- ============================================================
-- شحن الرصيد يُوزَّع تلقائياً على فواتير العميل غير المسدَّدة
--
-- عكسٌ مقصود لسياسة «تخزين فقط» في `20260731000000` بطلب صاحب المستودع.
--
-- ## طريقة التوزيع
--   • **الأقدم أولاً** (FIFO بتاريخ الفاتورة ثم رقمها): يُسدَّد أقدم دَين قبل
--     أحدثه — وهو ما يفعله المحاسب يدوياً، ويُقصّر عمر الذمم.
--   • **الفائض يبقى مخزّناً**: ما زاد عن مجموع الديون يبقى رصيداً دائناً
--     يوزّعه المستخدم لاحقاً على فواتير جديدة.
--   • **يُستثنى**: الفواتير الملغاة، وفواتير الكاش/POS (لا تخصّ بطاقة عميل).
--
-- ## لماذا هو آمن
--   1. كل تخصيص يُكتب **زوجاً كاملاً** بنفس اصطلاح `apply_customer_credit_to_invoice`:
--      دفعة `method='credit_balance'` + قيد `customer_credit` سالب. فيبقى
--      قابلاً للعكس بمسارات التعديل والحذف القائمة بلا استثناء خاص.
--   2. **صافي حساب العميل لا يتغيّر بالتوزيع** — المديونية والرصيد الدائن
--      ينقصان معاً. حارس نهائي يتحقّق أن الصافي بعد الشحن = الصافي قبله
--      ناقص المبلغ المشحون تماماً، ويُلغي المعاملة كلّها عند أي انحراف.
--   3. الكل في معاملة واحدة: إمّا الشحن وتوزيعه معاً أو لا شيء.
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
  v_amount     numeric := COALESCE(_amount, 0);
  v_group      uuid := gen_random_uuid();
  v_desc       text;
  v_cust       record;
  v_net_before numeric;
  v_net_after  numeric;
  v_remaining  numeric;
  v_apply      numeric;
  v_allocated  numeric := 0;
  v_new_paid   numeric;
  v_new_status text;
  v_allocs     jsonb := '[]'::jsonb;
  r            record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _customer_id IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  -- قفل صف العميل: يسلسل الشحن والسداد المتزامنين على نفس العميل
  SELECT id, COALESCE(balance, 0) AS balance, COALESCE(credit_balance, 0) AS credit_balance
    INTO v_cust
    FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;
  v_net_before := v_cust.balance - v_cust.credit_balance;

  v_desc := 'شحن رصيد عميل'
         || COALESCE(' - ' || NULLIF(_notes, ''), '')
         || CASE WHEN _reference_no IS NOT NULL AND _reference_no <> ''
                 THEN ' - رقم العملية: ' || _reference_no ELSE '' END;

  -- (1) قيد الرصيد الدائن بكامل المبلغ — أساس التوزيع وما يبقى منه فائضاً
  INSERT INTO public.transactions
    (type, category, amount, credit, date, method, customer_id, account_id, reference_no, description, allocation)
  VALUES
    ('income', 'customer_credit', v_amount, v_amount, _date, _method, _customer_id, _account_id,
     NULLIF(_reference_no, ''),
     v_desc,
     jsonb_build_object('group_id', v_group, 'kind', 'surplus', 'amount', v_amount, 'auto_distribute', true));

  -- (2) التوزيع: الأقدم أولاً حتى ينفد المبلغ أو تنتهي الديون
  v_remaining := v_amount;
  FOR r IN
    SELECT id, invoice_number, COALESCE(total, 0) AS total,
           COALESCE(paid_amount, 0) AS paid_amount
      FROM public.invoices
     WHERE customer_id = _customer_id
       AND COALESCE(status, '') <> 'cancelled'
       AND COALESCE(source, '') <> 'pos'
       AND COALESCE(total, 0) - COALESCE(paid_amount, 0) > 0.01
     ORDER BY date ASC, invoice_number ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.01;

    v_apply := LEAST(v_remaining, r.total - r.paid_amount);
    IF v_apply <= 0.01 THEN CONTINUE; END IF;

    v_new_paid := r.paid_amount + v_apply;
    v_new_status := CASE
      WHEN r.total > 0 AND v_new_paid >= r.total - 0.01 THEN 'paid'
      WHEN v_new_paid > 0.01 THEN 'partial'
      ELSE 'pending'
    END;

    -- دفعة بلا تدفّق نقدي: تدخل Σ دفعات الفاتورة فيمرّ فحص التناسق
    INSERT INTO public.transactions
      (type, category, amount, credit, date, method, customer_id, account_id, reference_id, description, allocation)
    VALUES
      ('income', 'customer_payment', v_apply, v_apply, _date, 'credit_balance',
       _customer_id, NULL, r.id::text,
       'سداد تلقائي من شحن الرصيد → فاتورة ' || COALESCE(r.invoice_number, ''),
       jsonb_build_object('kind', 'credit_used', 'group_id', v_group, 'charge_tx_id', NULL,
                          'invoice_id', r.id, 'invoice_number', r.invoice_number,
                          'applied', v_apply, 'paid_before', r.paid_amount,
                          'paid_after', v_new_paid, 'new_status', v_new_status,
                          'auto', true));

    -- الاستهلاك المقابل من الرصيد الدائن
    INSERT INTO public.transactions
      (type, category, amount, credit, date, method, customer_id, account_id, reference_id, description, allocation)
    VALUES
      ('expense', 'customer_credit', -v_apply, -v_apply, _date, 'credit_balance',
       _customer_id, NULL, r.id::text,
       'استهلاك رصيد دائن → فاتورة ' || COALESCE(r.invoice_number, ''),
       jsonb_build_object('kind', 'credit_used', 'group_id', v_group,
                          'invoice_id', r.id, 'invoice_number', r.invoice_number,
                          'applied', v_apply, 'auto', true));

    UPDATE public.invoices
       SET paid_amount = v_new_paid, status = v_new_status, updated_at = now()
     WHERE id = r.id;

    PERFORM public.assert_invoice_payment_consistency(r.id);

    v_remaining := v_remaining - v_apply;
    v_allocated := v_allocated + v_apply;
    v_allocs := v_allocs || jsonb_build_array(jsonb_build_object(
      'invoice_id', r.id, 'invoice_number', r.invoice_number,
      'invoice_total', r.total, 'applied', v_apply,
      'paid_before', r.paid_amount, 'paid_after', v_new_paid,
      'remaining_after', GREATEST(r.total - v_new_paid, 0),
      'new_status', v_new_status));
  END LOOP;

  PERFORM public.recompute_customer_balance(_customer_id);
  IF _account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(_account_id);
  END IF;

  -- (3) الحارس: التوزيع نقل داخلي لا يغيّر الصافي، فأثر العملية كلّها هو
  --     الشحن وحده. أي انحراف يعني خللاً في القيود ⇒ ألغِ كل شيء.
  SELECT COALESCE(balance, 0) - COALESCE(credit_balance, 0)
    INTO v_net_after FROM public.customers WHERE id = _customer_id;
  IF ABS(v_net_after - (v_net_before - v_amount)) > 0.01 THEN
    RAISE EXCEPTION 'charge_failed:net_drift:expected % got %',
      v_net_before - v_amount, v_net_after USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'group_id', v_group, 'total', v_amount,
    'allocated', v_allocated, 'surplus', v_remaining, 'credited', v_amount,
    'allocations', v_allocs, 'stored_only', false, 'auto_distributed', true,
    'net_before', v_net_before, 'net_after', v_net_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) TO authenticated, service_role;

-- المسار القديم يبقى مفوّضاً للدالة أعلاه — مسار توزيع واحد لا اثنان.
CREATE OR REPLACE FUNCTION public.allocate_customer_charge(
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
BEGIN
  RETURN public.record_customer_charge(
    _customer_id, _amount, _date, _method, _account_id, _reference_no, _notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_customer_charge(uuid, numeric, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_customer_charge(uuid, numeric, date, text, uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
