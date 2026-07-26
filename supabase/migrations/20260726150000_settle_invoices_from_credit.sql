-- ============================================================
-- سداد فواتير متعددة من الرصيد الدائن للعميل — دفعة واحدة ذرّية
--
-- تُستدعى من نافذة «سداد فواتير من رصيد العميل» في كشف الحساب.
-- المبدأ المحاسبي: السداد من الرصيد لا يغيّر صافي حساب العميل إطلاقاً —
-- المديونية (balance) والرصيد الدائن (credit_balance) ينقصان بنفس المبلغ،
-- فيبقى net_balance = balance - credit_balance كما هو. حارس نهائي يتحقق من
-- هذا الثابت ويُلغي المعاملة كاملة عند أي انحراف > 0.01.
--
-- الذرّية: كل الفواتير تُسدَّد في معاملة واحدة أو لا شيء (RAISE يعمل rollback).
-- لكل فاتورة: قيد customer_payment (method=credit_balance) + قيد customer_credit
-- سالب — نفس اصطلاح apply_customer_credit_to_invoice تماماً، فيمرّ على
-- assert_invoice_payment_consistency و recompute_customer_balance بلا انحراف.
-- ============================================================
CREATE OR REPLACE FUNCTION public.settle_invoices_from_credit(
  _customer_id uuid,
  _items jsonb,               -- [{"invoice_id":"…","amount":123.45}, …]
  _date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer   record;
  v_inv        record;
  r            record;
  v_avail      numeric;
  v_total_req  numeric := 0;
  v_apply      numeric;
  v_new_paid   numeric;
  v_new_status text;
  v_date       date := COALESCE(_date, CURRENT_DATE);
  v_group      uuid := gen_random_uuid();
  v_results    jsonb := '[]'::jsonb;
  v_applied    numeric := 0;
  v_skipped    int := 0;
  v_net_before numeric;
  v_net_after  numeric;
  v_items_n    int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _customer_id IS NULL OR _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;
  v_items_n := jsonb_array_length(_items);
  IF v_items_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;
  IF v_items_n > 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_items');
  END IF;

  -- قفل صف العميل: يسلسل عمليات السداد/الشحن المتزامنة على نفس العميل.
  SELECT id, name, COALESCE(balance, 0) AS balance, COALESCE(credit_balance, 0) AS credit_balance
    INTO v_customer
    FROM public.customers
   WHERE id = _customer_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;

  v_avail := v_customer.credit_balance;
  v_net_before := v_customer.balance - v_customer.credit_balance;
  IF v_avail <= 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_credit_available');
  END IF;

  -- تجميع الطلب لكل فاتورة (يمنع ازدواج السداد لو تكرر نفس الـ id) + فحص المبالغ.
  FOR r IN
    SELECT (value->>'invoice_id')::uuid AS invoice_id,
           SUM((value->>'amount')::numeric) AS amount
      FROM jsonb_array_elements(_items)
     GROUP BY 1
  LOOP
    IF r.invoice_id IS NULL OR r.amount IS NULL OR r.amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
    END IF;
    v_total_req := v_total_req + r.amount;
  END LOOP;
  IF v_total_req - v_avail > 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_exceeds_credit',
      'available', v_avail, 'requested', v_total_req);
  END IF;

  -- التطبيق — أي مشكلة في فاتورة داخل الدفعة تُلغي الدفعة كلها (RAISE ⇒ rollback).
  FOR r IN
    SELECT (value->>'invoice_id')::uuid AS invoice_id,
           SUM((value->>'amount')::numeric) AS amount
      FROM jsonb_array_elements(_items)
     GROUP BY 1
     ORDER BY 1
  LOOP
    SELECT id, invoice_number, COALESCE(total, 0) AS total,
           COALESCE(paid_amount, 0) AS paid_amount,
           COALESCE(status, '') AS status,
           COALESCE(source, '') AS source,
           customer_id
      INTO v_inv
      FROM public.invoices
     WHERE id = r.invoice_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'settle_failed:invoice_not_found:%', r.invoice_id USING ERRCODE = 'check_violation';
    END IF;
    IF v_inv.customer_id IS DISTINCT FROM _customer_id THEN
      RAISE EXCEPTION 'settle_failed:invoice_not_owned:%', v_inv.invoice_number USING ERRCODE = 'check_violation';
    END IF;
    IF v_inv.status = 'cancelled' THEN
      RAISE EXCEPTION 'settle_failed:invoice_cancelled:%', v_inv.invoice_number USING ERRCODE = 'check_violation';
    END IF;
    IF v_inv.source = 'pos' THEN
      RAISE EXCEPTION 'settle_failed:invoice_is_pos:%', v_inv.invoice_number USING ERRCODE = 'check_violation';
    END IF;

    -- دفاع ضد سباق: لو سُدِّدت الفاتورة جزئياً بالتوازي نقصّ المطبَّق على المتبقي
    -- الفعلي بدل الفشل — المجموع الفعلي ≤ المطلوب ≤ الرصيد فيبقى الفحص سليماً.
    v_apply := LEAST(r.amount, GREATEST(v_inv.total - v_inv.paid_amount, 0));
    IF v_apply <= 0.01 THEN
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number,
        'skipped', true, 'reason', 'already_paid'));
      CONTINUE;
    END IF;

    v_new_paid := v_inv.paid_amount + v_apply;
    v_new_status := CASE
      WHEN v_inv.total > 0 AND v_new_paid >= v_inv.total - 0.01 THEN 'paid'
      WHEN v_new_paid > 0.01 THEN 'partial'
      ELSE 'pending'
    END;

    -- قيد دفع بلا تدفق نقدي — يدخل في Σ دفعات الفاتورة (assert_invoice_payment_consistency).
    INSERT INTO public.transactions
      (type, category, amount, credit, date, method, customer_id, account_id, reference_id, description, allocation)
    VALUES
      ('income', 'customer_payment', v_apply, v_apply, v_date, 'credit_balance',
       _customer_id, NULL, v_inv.id::text,
       'سداد من الرصيد الدائن → فاتورة ' || COALESCE(v_inv.invoice_number, ''),
       jsonb_build_object(
         'kind', 'credit_used', 'settle_group', v_group,
         'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number,
         'applied', v_apply, 'paid_before', v_inv.paid_amount,
         'paid_after', v_new_paid, 'new_status', v_new_status
       ));

    -- استهلاك مقابل من الرصيد الدائن (سالب) — نفس اصطلاح apply_customer_credit_to_invoice.
    INSERT INTO public.transactions
      (type, category, amount, credit, date, method, customer_id, account_id, reference_id, description, allocation)
    VALUES
      ('expense', 'customer_credit', -v_apply, -v_apply, v_date, 'credit_balance',
       _customer_id, NULL, v_inv.id::text,
       'استهلاك رصيد دائن → فاتورة ' || COALESCE(v_inv.invoice_number, ''),
       jsonb_build_object(
         'kind', 'credit_used', 'settle_group', v_group,
         'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number,
         'applied', v_apply
       ));

    UPDATE public.invoices
       SET paid_amount = v_new_paid,
           status = v_new_status,
           updated_at = now()
     WHERE id = v_inv.id;

    v_applied := v_applied + v_apply;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'invoice_id', v_inv.id,
      'invoice_number', v_inv.invoice_number,
      'invoice_total', v_inv.total,
      'applied', v_apply,
      'paid_before', v_inv.paid_amount,
      'paid_after', v_new_paid,
      'remaining_after', GREATEST(v_inv.total - v_new_paid, 0),
      'new_status', v_new_status
    ));
  END LOOP;

  IF v_applied <= 0.01 THEN
    -- لا شيء طُبِّق فعلياً (كل الفواتير كانت مسددة بالتوازي) — لا قيود كُتبت للفواتير
    -- المتخطاة، فالإرجاع هنا آمن.
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_to_apply', 'results', v_results);
  END IF;

  PERFORM public.recompute_customer_balance(_customer_id);

  -- فحص تناسق لكل فاتورة مُسّت: paid_amount = Σ الدفعات، وعدم تجاوز الإجمالي.
  FOR r IN SELECT DISTINCT (value->>'invoice_id')::uuid AS invoice_id FROM jsonb_array_elements(_items) LOOP
    PERFORM public.assert_invoice_payment_consistency(r.invoice_id);
  END LOOP;

  -- الحارس الأهم: السداد من الرصيد يجب ألا يغيّر صافي حساب العميل إطلاقاً.
  SELECT COALESCE(balance, 0) - COALESCE(credit_balance, 0)
    INTO v_net_after
    FROM public.customers WHERE id = _customer_id;
  IF ABS(v_net_after - v_net_before) > 0.01 THEN
    RAISE EXCEPTION 'settle_failed:net_balance_drift: before=% after=%', v_net_before, v_net_after
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'settle_group', v_group,
    'customer_id', _customer_id,
    'applied_total', v_applied,
    'invoices_paid', jsonb_array_length(v_results) - v_skipped,
    'skipped', v_skipped,
    'credit_before', v_avail,
    'credit_after', GREATEST(v_avail - v_applied, 0),
    'net_before', v_net_before,
    'net_after', v_net_after,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_invoices_from_credit(uuid, jsonb, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_invoices_from_credit(uuid, jsonb, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
