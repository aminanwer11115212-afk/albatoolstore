-- ============================================================================
--  طبّق هذا الملف مرّة واحدة في SQL Editor بلوحة Supabase
--
--  يجمع كل الهجرات المعلّقة التي لم تُطبَّق على القاعدة المنشورة، **بترتيبها**.
--  كلها `CREATE OR REPLACE` فآمنة التكرار: شغّلها مرّة أو عشراً، النتيجة واحدة.
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════
--  20260730120000_delete_customer_credit_entry.sql
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_customer_credit_entry(
  _tx_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx              record;
  v_group           uuid;
  v_amount          numeric := 0;
  v_net_credit      numeric := 0;
  v_linked_consumed numeric := 0;
  v_net_before      numeric := 0;
  v_net_after       numeric := 0;
  v_deleted         int := 0;
  v_reverse         jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized_admin_only');
  END IF;
  IF _tx_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_tx_id');
  END IF;

  SELECT id, customer_id, account_id, amount, category, description, reference_no, allocation
    INTO v_tx
    FROM public.transactions
   WHERE id = _tx_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tx_not_found');
  END IF;

  IF v_tx.category <> 'customer_credit' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_credit_charge');
  END IF;
  IF COALESCE(v_tx.amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'credit_consumption_not_deletable');
  END IF;
  IF v_tx.customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_customer');
  END IF;

  v_amount := COALESCE(v_tx.amount, 0);
  v_group  := NULLIF(v_tx.allocation->>'group_id', '')::uuid;

  SELECT COALESCE(net_balance, COALESCE(balance, 0) - COALESCE(credit_balance, 0))
    INTO v_net_before
    FROM public.customers
   WHERE id = v_tx.customer_id;

  -- (أ) استهلاك مربوط صراحةً بهذه الشحنة (نفس المجموعة أو يشير إليها).
  SELECT COALESCE(SUM(ABS(COALESCE(amount, 0))), 0)
    INTO v_linked_consumed
    FROM public.transactions
   WHERE customer_id = v_tx.customer_id
     AND category = 'customer_credit'
     AND COALESCE(amount, 0) < 0
     AND id <> _tx_id
     AND (
       (v_group IS NOT NULL AND NULLIF(allocation->>'group_id', '')::uuid = v_group)
       OR allocation->>'charge_tx_id' = _tx_id::text
     );

  -- (ب) الرصيد الدائن المتبقي فعلياً = Σ الشحنات − Σ الاستهلاك.
  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
    INTO v_net_credit
    FROM public.transactions
   WHERE customer_id = v_tx.customer_id
     AND category = 'customer_credit';

  IF v_linked_consumed > 0.01 OR v_net_credit < v_amount - 0.01 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN v_linked_consumed > 0.01
                     THEN 'explicit_consumption'
                     ELSE 'insufficient_remaining_credit' END,
      'tx_id', _tx_id,
      'amount', v_amount,
      'consumed', v_linked_consumed,
      'available_credit', v_net_credit
    );
  END IF;

  IF v_group IS NOT NULL THEN
    -- مجموعة كاملة: نعكسها بدل حذف صف واحد منها فتبقى بقيتها بلا شحنة.
    v_reverse := public.reverse_customer_charge(v_group);
    IF NOT COALESCE((v_reverse->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reverse_failed', 'details', v_reverse);
    END IF;
    v_deleted := COALESCE((v_reverse->>'transactions_deleted')::int, 1);
  ELSE
    DELETE FROM public.transactions WHERE id = _tx_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    -- الـ trigger يتكفّل بإعادة الحساب؛ نستدعيها صراحةً كشبكة أمان فقط.
    PERFORM public.recompute_customer_balance(v_tx.customer_id);
    IF v_tx.account_id IS NOT NULL THEN
      PERFORM public.recompute_account_balance(v_tx.account_id);
    END IF;
  END IF;

  SELECT COALESCE(net_balance, COALESCE(balance, 0) - COALESCE(credit_balance, 0))
    INTO v_net_after
    FROM public.customers
   WHERE id = v_tx.customer_id;

  BEGIN
    INSERT INTO public.activity_log (
      action, entity_type, entity_id, table_name, record_id, changed_by, old_data, details
    ) VALUES (
      'delete_customer_credit_entry', 'transaction', _tx_id, 'transactions', _tx_id, auth.uid(),
      jsonb_build_object(
        'amount', v_amount,
        'category', v_tx.category,
        'description', v_tx.description,
        'reference_no', v_tx.reference_no,
        'customer_id', v_tx.customer_id,
        'allocation', v_tx.allocation
      ),
      jsonb_build_object(
        'reason', _reason,
        'group_id', v_group,
        'deleted_rows', v_deleted,
        'net_before', v_net_before,
        'net_after', v_net_after,
        'at', now(),
        'by', auth.uid()
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', _tx_id,
    'customer_id', v_tx.customer_id,
    'amount_deleted', v_amount,
    'deleted_rows', v_deleted,
    'net_before', v_net_before,
    'net_after', v_net_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_customer_credit_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_customer_credit_entry(uuid, text) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_transactions_customer_category
  ON public.transactions (customer_id, category)
  WHERE customer_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

CREATE INDEX IF NOT EXISTS idx_data_anomalies_status_severity_seen
  ON public.data_anomalies (status, severity, last_seen_at DESC);

-- ══════════════════════════════════════════════════════════════════
--  20260731000000_force_charge_store_only.sql
-- ══════════════════════════════════════════════════════════════════

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

  SELECT id INTO v_cust FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF v_cust IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;

  v_desc := 'شحن رصيد عميل'
         || COALESCE(' - ' || NULLIF(_notes, ''), '')
         || CASE WHEN _reference_no IS NOT NULL AND _reference_no <> ''
                 THEN ' - رقم العملية: ' || _reference_no ELSE '' END;

  -- قيد رصيد دائن واحد بكامل المبلغ — لا يمسّ أي فاتورة إطلاقاً.
  INSERT INTO public.transactions
    (type, category, amount, credit, date, method, customer_id, account_id, reference_no, description, allocation)
  VALUES
    ('income', 'customer_credit', v_amount, v_amount, _date, _method, _customer_id, _account_id,
     NULLIF(_reference_no, ''),
     v_desc,
     jsonb_build_object('group_id', v_group, 'kind', 'surplus', 'amount', v_amount, 'stored_only', true)
    );

  PERFORM public.recompute_customer_balance(_customer_id);
  IF _account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(_account_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'group_id', v_group, 'total', v_amount,
    'allocated', 0, 'surplus', v_amount, 'credited', v_amount,
    'allocations', '[]'::jsonb, 'stored_only', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) TO authenticated, service_role;

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
  -- لم يعد يوزّع (FIFO) — التوزيع صار يدوياً من كشف حساب العميل.
  RETURN public.record_customer_charge(
    _customer_id, _amount, _date, _method, _account_id, _reference_no, _notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_customer_charge(uuid, numeric, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_customer_charge(uuid, numeric, date, text, uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════
--  20260801000000_hard_delete_invoice_and_charges.sql
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) حذف الفاتورة: امحُ الدفعات، لا تحوّلها
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_invoice_with_reconciliation(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       record;
  v_rows      int := 0;
  v_amount    numeric := 0;
  v_snapshot  jsonb := '[]'::jsonb;
  v_accounts  uuid[];
  v_acc       uuid;
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

  -- لقطة كاملة قبل الحذف: هي الأثر التدقيقي الوحيد بعد محو الصفوف.
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb),
         COALESCE(SUM(COALESCE(t.amount, 0)), 0),
         COUNT(*)::int,
         COALESCE(array_agg(DISTINCT t.account_id) FILTER (WHERE t.account_id IS NOT NULL), '{}')
    INTO v_snapshot, v_amount, v_rows, v_accounts
    FROM public.transactions t
   WHERE t.reference_id = _invoice_id::text
     AND t.category IN ('customer_payment', 'customer_credit');

  -- الحذف النهائي: الدفعات وقيود الرصيد المرتبطة بهذه الفاتورة معاً.
  DELETE FROM public.transactions
   WHERE reference_id = _invoice_id::text
     AND category IN ('customer_payment', 'customer_credit');

  IF v_inv.customer_id IS NOT NULL THEN
    PERFORM public.recompute_customer_balance(v_inv.customer_id);
  END IF;
  FOREACH v_acc IN ARRAY v_accounts LOOP
    PERFORM public.recompute_account_balance(v_acc);
  END LOOP;

  BEGIN
    INSERT INTO public.activity_log (action, entity_type, entity_id, table_name, record_id, changed_by, old_data, details)
    VALUES ('delete_invoice_payments', 'invoice', _invoice_id, 'transactions', _invoice_id, auth.uid(),
            v_snapshot,
            jsonb_build_object(
              'invoice_number', v_inv.invoice_number,
              'customer_id', v_inv.customer_id,
              'paid_amount', v_inv.paid_amount,
              'deleted_rows', v_rows,
              'deleted_amount', v_amount,
              'policy', 'hard_delete_not_credited',
              'at', now(), 'by', auth.uid()));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_inv.customer_id,
    'paid_amount', v_inv.paid_amount,
    'deleted_rows', v_rows,
    'deleted_amount', v_amount,
    'converted_payments', 0,
    'converted_amount', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_with_reconciliation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_invoice_with_reconciliation(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) حذف أي شحنة رصيد — ولو استُهلك منها
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_customer_credit_entry(
  _tx_id  uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx          record;
  v_group       uuid;
  v_customer    uuid;
  v_net_before  numeric;
  v_net_after   numeric;
  v_snapshot    jsonb;
  v_reversed    int := 0;
  v_reversed_amt numeric := 0;
  r             record;
  v_new_paid    numeric;
  v_new_status  text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized_admin_only');
  END IF;
  IF _tx_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_tx_id');
  END IF;

  SELECT id, customer_id, account_id, amount, category, allocation, description, date
    INTO v_tx
    FROM public.transactions
   WHERE id = _tx_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tx_not_found');
  END IF;
  IF v_tx.category <> 'customer_credit' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_credit_charge');
  END IF;
  IF COALESCE(v_tx.amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'credit_consumption_not_deletable');
  END IF;

  v_customer := v_tx.customer_id;
  v_group    := NULLIF(v_tx.allocation->>'group_id', '')::uuid;

  SELECT COALESCE(balance, 0) - COALESCE(credit_balance, 0)
    INTO v_net_before FROM public.customers WHERE id = v_customer;

  -- (أ) اعكس ما استُهلك من هذه الشحنة على الفواتير
  FOR r IN
    SELECT t.id, t.amount, t.reference_id
      FROM public.transactions t
     WHERE t.customer_id = v_customer
       AND t.category = 'customer_credit'
       AND t.amount < 0
       AND (
         (v_group IS NOT NULL AND (t.allocation->>'group_id')::uuid = v_group)
         OR (t.allocation->>'charge_tx_id') = _tx_id::text
       )
  LOOP
    IF r.reference_id IS NOT NULL AND r.reference_id ~ '^[0-9a-fA-F-]{36}$' THEN
      UPDATE public.invoices
         SET paid_amount = GREATEST(COALESCE(paid_amount, 0) - ABS(r.amount), 0),
             status = CASE
               WHEN COALESCE(total, 0) > 0
                    AND GREATEST(COALESCE(paid_amount, 0) - ABS(r.amount), 0) >= COALESCE(total, 0) - 0.01
                 THEN 'paid'
               WHEN GREATEST(COALESCE(paid_amount, 0) - ABS(r.amount), 0) > 0.01 THEN 'partial'
               ELSE 'pending'
             END,
             updated_at = now()
       WHERE id = r.reference_id::uuid;

      -- الدفعة المقابلة (method='credit_balance') تُحذف معه: نصفا عملية واحدة
      DELETE FROM public.transactions
       WHERE customer_id = v_customer
         AND category = 'customer_payment'
         AND method = 'credit_balance'
         AND reference_id = r.reference_id
         AND ABS(COALESCE(amount, 0) - ABS(r.amount)) < 0.01;
    END IF;

    v_reversed := v_reversed + 1;
    v_reversed_amt := v_reversed_amt + ABS(r.amount);
    DELETE FROM public.transactions WHERE id = r.id;
  END LOOP;

  -- (ب) احذف الشحنة نفسها — ومجموعتها كاملةً إن كانت لها مجموعة
  IF v_group IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_snapshot
      FROM public.transactions t WHERE (t.allocation->>'group_id')::uuid = v_group;
    DELETE FROM public.transactions WHERE (allocation->>'group_id')::uuid = v_group;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_snapshot
      FROM public.transactions t WHERE t.id = _tx_id;
    DELETE FROM public.transactions WHERE id = _tx_id;
  END IF;

  PERFORM public.recompute_customer_balance(v_customer);
  IF v_tx.account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(v_tx.account_id);
  END IF;

  SELECT COALESCE(balance, 0) - COALESCE(credit_balance, 0)
    INTO v_net_after FROM public.customers WHERE id = v_customer;

  BEGIN
    INSERT INTO public.activity_log (action, entity_type, entity_id, table_name, record_id, changed_by, old_data, details)
    VALUES ('delete_customer_credit_entry', 'transaction', _tx_id, 'transactions', _tx_id, auth.uid(),
            v_snapshot,
            jsonb_build_object('reason', _reason, 'customer_id', v_customer,
                               'amount', v_tx.amount, 'group_id', v_group,
                               'reversed_consumptions', v_reversed,
                               'reversed_amount', v_reversed_amt,
                               'net_before', v_net_before, 'net_after', v_net_after,
                               'at', now(), 'by', auth.uid()));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true, 'tx_id', _tx_id, 'customer_id', v_customer,
    'amount_deleted', v_tx.amount, 'group_id', v_group,
    'reversed_consumptions', v_reversed, 'reversed_amount', v_reversed_amt,
    'net_before', v_net_before, 'net_after', v_net_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_customer_credit_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_customer_credit_entry(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- ══════════════════════════════════════════════════════════════════
--  20260801200000_final_store_only_charge.sql  ← الأخيرة، وهي الحاكمة
-- ══════════════════════════════════════════════════════════════════

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

  SELECT id INTO v_cust FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF v_cust IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  END IF;

  v_desc := 'شحن رصيد عميل'
         || COALESCE(' - ' || NULLIF(_notes, ''), '')
         || CASE WHEN _reference_no IS NOT NULL AND _reference_no <> ''
                 THEN ' - رقم العملية: ' || _reference_no ELSE '' END;

  -- قيد رصيد دائن واحد بكامل المبلغ — لا يمسّ أي فاتورة إطلاقاً.
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

  RETURN jsonb_build_object(
    'ok', true, 'group_id', v_group, 'total', v_amount,
    'allocated', 0, 'surplus', v_amount, 'credited', v_amount,
    'allocations', '[]'::jsonb, 'stored_only', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_charge(uuid, numeric, date, text, uuid, text, text) TO authenticated, service_role;

-- المسار القديم يفوّض للدالة أعلاه، فلا يبقى مسار توزيع ثانٍ في القاعدة.
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