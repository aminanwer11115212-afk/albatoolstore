CREATE OR REPLACE FUNCTION public.delete_invoice_with_reconciliation(_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_deleted_tx int := 0;
  v_deleted_surplus int := 0;
  v_deleted_surplus_amount numeric := 0;
  v_reversed_credit_rows int := 0;
  v_restored_credit numeric := 0;
  v_account_ids uuid[] := ARRAY[]::uuid[];
  v_surplus_ids uuid[] := ARRAY[]::uuid[];
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
    -- 1) اجمع الحسابات المتأثرة بالدفعات لإعادة حسابها لاحقاً
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

    -- 2) احذف دفعات الفاتورة (customer_payment)
    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_payment'
       AND customer_id = v_inv.customer_id;
    GET DIAGNOSTICS v_deleted_tx = ROW_COUNT;

    -- 3) اجمع معرّفات صفوف الفائض (customer_credit موجب) المرتبطة بهذه الفاتورة
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]),
           COALESCE(SUM(amount), 0)
      INTO v_surplus_ids, v_deleted_surplus_amount
      FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_credit'
       AND customer_id = v_inv.customer_id
       AND amount > 0;

    -- 4) احذف أي حركات استهلاك لهذا الفائض (allocation.consumed_from = id من v_surplus_ids)
    --    حتى لا يبقى قيد سالب يشير لمصدر محذوف.
    IF array_length(v_surplus_ids, 1) > 0 THEN
      -- اجمع أيضاً معرّفات الحسابات لتلك الاستهلاكات (إن وُجدت)
      FOR r IN
        SELECT DISTINCT account_id
          FROM public.transactions
         WHERE category = 'customer_credit'
           AND customer_id = v_inv.customer_id
           AND amount < 0
           AND account_id IS NOT NULL
           AND (allocation->>'consumed_from')::uuid = ANY(v_surplus_ids)
      LOOP
        IF NOT (r.account_id = ANY(v_account_ids)) THEN
          v_account_ids := array_append(v_account_ids, r.account_id);
        END IF;
      END LOOP;

      DELETE FROM public.transactions
       WHERE category = 'customer_credit'
         AND customer_id = v_inv.customer_id
         AND amount < 0
         AND (allocation->>'consumed_from')::uuid = ANY(v_surplus_ids);
    END IF;

    -- 5) احذف صفوف الفائض الموجبة نفسها
    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_credit'
       AND customer_id = v_inv.customer_id
       AND amount > 0;
    GET DIAGNOSTICS v_deleted_surplus = ROW_COUNT;

    -- 6) توافق مع السلوك السابق: احذف أي حركات customer_credit سالبة مرتبطة مباشرة بالفاتورة
    SELECT COALESCE(SUM(-amount), 0)
      INTO v_restored_credit
      FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_credit'
       AND customer_id = v_inv.customer_id
       AND amount < 0;

    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_credit'
       AND customer_id = v_inv.customer_id
       AND amount < 0;
    GET DIAGNOSTICS v_reversed_credit_rows = ROW_COUNT;

    -- 7) أعِد حساب أرصدة الحسابات المتأثرة ثم رصيد العميل
    IF array_length(v_account_ids, 1) > 0 THEN
      FOR r IN SELECT unnest(v_account_ids) AS aid LOOP
        PERFORM public.recompute_account_balance(r.aid);
      END LOOP;
    END IF;

    PERFORM public.recompute_customer_balance(v_inv.customer_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_inv.customer_id,
    'paid_amount', v_inv.paid_amount,
    'deleted_payments', v_deleted_tx,
    'deleted_surplus_rows', v_deleted_surplus,
    'deleted_surplus_amount', v_deleted_surplus_amount,
    'reversed_credit_rows', v_reversed_credit_rows,
    'restored_credit', v_restored_credit,
    'affected_accounts', COALESCE(array_length(v_account_ids, 1), 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_with_reconciliation(uuid) TO authenticated, service_role;