-- ============================================================
-- 1) مدقّق تناسق الفاتورة: paid_amount يجب أن يساوي Σ الدفعات المسجّلة.
--    يستدعى في نهاية RPCs تعديل/استرجاع الدفعات لضمان الرولباك عند أي فارق.
-- ============================================================
CREATE OR REPLACE FUNCTION public.assert_invoice_payment_consistency(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid  numeric;
  v_sum   numeric;
  v_total numeric;
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(paid_amount, 0), COALESCE(total, 0)
    INTO v_paid, v_total
    FROM public.invoices
   WHERE id = _invoice_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Σ الدفعات (customer_payment) المرتبطة بالفاتورة — يشمل قيود method=credit_balance.
  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
    INTO v_sum
    FROM public.transactions
   WHERE reference_id = _invoice_id::text
     AND category = 'customer_payment';

  IF ABS(v_sum - v_paid) > 0.01 THEN
    RAISE EXCEPTION 'inconsistent_invoice_payment: paid_amount=% but Σ payments=% for invoice %',
      v_paid, v_sum, _invoice_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- منع تجاوز الإجمالي (باستثناء الملغاة).
  IF v_total > 0 AND v_paid - v_total > 0.01 THEN
    RAISE EXCEPTION 'inconsistent_invoice_payment: paid_amount=% exceeds total=% for invoice %',
      v_paid, v_total, _invoice_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_invoice_payment_consistency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_invoice_payment_consistency(uuid) TO authenticated, service_role;

-- ============================================================
-- 2) أعِد إنشاء refund_payment_to_customer_credit مع فحص التناسق قبل الإرجاع.
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
           'amount_after', v_new_amount,
           'note', _note
         )
   WHERE id = _tx_id;

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
       'invoice_id', v_invoice_id,
       'note', _note
     )
    );

  PERFORM public.recompute_customer_balance(v_tx.customer_id);
  IF v_tx.account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(v_tx.account_id);
  END IF;

  -- فحص تناسق: أي اختلاف بين paid_amount وΣ الدفعات يُلغي المعاملة كاملة.
  IF v_invoice_id IS NOT NULL THEN
    PERFORM public.assert_invoice_payment_consistency(v_invoice_id);
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

-- ============================================================
-- 3) تعديل revise_invoice_payment ليقوم بفحص التناسق قبل الإرجاع.
--    يتم إعادة الإنشاء بمواصفات مطابقة لما هو موجود + استدعاء المدقّق.
-- ============================================================
DO $do$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='revise_invoice_payment'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE NOTICE 'revise_invoice_payment not found; skipping wrap.';
    RETURN;
  END IF;
END $do$;

-- نلفّ الاستدعاءات بمدقق عبر trigger AFTER على invoices.
-- (نُنشئ trigger إن لم يوجد؛ لتغطية أي مسار حفظ.)
CREATE OR REPLACE FUNCTION public.trg_assert_invoice_payment_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- افحص فقط عند تغيّر paid_amount لتجنّب حلقات لا لزوم لها.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.paid_amount, 0) IS NOT DISTINCT FROM COALESCE(NEW.paid_amount, 0) THEN
    RETURN NEW;
  END IF;
  -- لا نُدقّق الملغاة (لا معنى لها).
  IF COALESCE(NEW.status, '') = 'cancelled' THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_invoice_payment_consistency(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_payment_consistency ON public.invoices;
CREATE CONSTRAINT TRIGGER trg_invoices_payment_consistency
  AFTER INSERT OR UPDATE OF paid_amount, status ON public.invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assert_invoice_payment_consistency();

-- ============================================================
-- 4) RPC ذرّي لتطبيق جزء من الرصيد الدائن على فاتورة مفتوحة.
--    يُنشئ قيد customer_payment (method=credit_balance) و customer_credit سالب،
--    ويرفع paid_amount ويعيد حساب الأرصدة ثم يُدقّق التناسق.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_customer_credit_to_invoice(
  _customer_id uuid,
  _invoice_id  uuid,
  _amount      numeric,
  _date        date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer record;
  v_inv      record;
  v_avail    numeric;
  v_apply    numeric;
  v_new_paid numeric;
  v_new_status text;
  v_date     date := COALESCE(_date, CURRENT_DATE);
  v_group    uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _customer_id IS NULL OR _invoice_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT id, name, COALESCE(credit_balance, 0) AS credit_balance
    INTO v_customer
    FROM public.customers
   WHERE id = _customer_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;

  SELECT id, invoice_number, COALESCE(total, 0) AS total,
         COALESCE(paid_amount, 0) AS paid_amount,
         COALESCE(status, '') AS status,
         COALESCE(source, '') AS source
    INTO v_inv
    FROM public.invoices
   WHERE id = _invoice_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  END IF;
  IF v_inv.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_cancelled');
  END IF;
  IF v_inv.source = 'pos' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_is_pos');
  END IF;

  v_avail := v_customer.credit_balance;
  IF v_avail <= 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_credit_available');
  END IF;
  IF _amount - v_avail > 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount_exceeds_credit',
      'available', v_avail);
  END IF;
  v_apply := LEAST(_amount, GREATEST(v_inv.total - v_inv.paid_amount, 0));
  IF v_apply <= 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_already_paid');
  END IF;

  v_new_paid := v_inv.paid_amount + v_apply;
  v_new_status := CASE
    WHEN v_inv.total > 0 AND v_new_paid >= v_inv.total - 0.01 THEN 'paid'
    WHEN v_new_paid > 0.01 THEN 'partial'
    ELSE 'pending'
  END;

  -- قيد دفع بدون تدفق نقدي — يظهر ضمن دفعات الفاتورة.
  INSERT INTO public.transactions
    (type, category, amount, credit, date, method, customer_id, account_id, reference_id, description, allocation)
  VALUES
    ('income', 'customer_payment', v_apply, v_apply, v_date, 'credit_balance',
     _customer_id, NULL, _invoice_id::text,
     'استخدام رصيد دائن على الفاتورة ' || COALESCE(v_inv.invoice_number, ''),
     jsonb_build_object(
       'kind', 'credit_used', 'invoice_id', _invoice_id,
       'invoice_number', v_inv.invoice_number,
       'apply_group', v_group,
       'applied', v_apply
     )
    );

  -- استهلاك من الرصيد الدائن.
  INSERT INTO public.transactions
    (type, category, amount, credit, date, method, customer_id, account_id, reference_id, description, allocation)
  VALUES
    ('expense', 'customer_credit', -v_apply, -v_apply, v_date, 'credit_balance',
     _customer_id, NULL, _invoice_id::text,
     'استهلاك رصيد دائن على الفاتورة ' || COALESCE(v_inv.invoice_number, ''),
     jsonb_build_object(
       'kind', 'credit_used', 'invoice_id', _invoice_id,
       'invoice_number', v_inv.invoice_number,
       'apply_group', v_group,
       'applied', v_apply
     )
    );

  UPDATE public.invoices
     SET paid_amount = v_new_paid,
         status = v_new_status,
         updated_at = now()
   WHERE id = _invoice_id;

  PERFORM public.recompute_customer_balance(_customer_id);
  PERFORM public.assert_invoice_payment_consistency(_invoice_id);

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', _customer_id,
    'applied', v_apply,
    'paid_before', v_inv.paid_amount,
    'paid_after', v_new_paid,
    'new_status', v_new_status,
    'credit_before', v_avail,
    'credit_after', GREATEST(v_avail - v_apply, 0),
    'apply_group', v_group
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_customer_credit_to_invoice(uuid, uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_customer_credit_to_invoice(uuid, uuid, numeric, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';