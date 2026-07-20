-- ============================================================
-- حذف الفاتورة: عكس الأثر المالي بالكامل ليرجع حساب العميل لحالته قبلها.
--
-- يحذف:
--   • قيود الدفع (customer_payment) المرتبطة بالفاتورة.
--   • قيود الرصيد الدائن (customer_credit) المرتبطة بالفاتورة:
--       - الفائض (overpay_surplus) الذي أُضيف لحساب العميل عند الدفع الزائد.
--       - قيود استهلاك الرصيد (السالبة) — حذفها يُعيد الرصيد المستهلَك.
-- ثم يعيد حساب رصيد العميل والحسابات المتأثّرة.
--
-- الحذف الفعلي للفاتورة وبنودها والمخزون يبقى في الواجهة (deleteInvoice.ts).
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_invoice_with_reconciliation(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_deleted_payments int := 0;
  v_deleted_credits  int := 0;
  v_account_ids uuid[] := ARRAY[]::uuid[];
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
    -- اجمع الحسابات المتأثّرة (من الدفعات والفائض) قبل الحذف.
    FOR r IN
      SELECT DISTINCT account_id
        FROM public.transactions
       WHERE reference_id = _invoice_id::text
         AND category IN ('customer_payment', 'customer_credit')
         AND customer_id = v_inv.customer_id
         AND account_id IS NOT NULL
    LOOP
      v_account_ids := array_append(v_account_ids, r.account_id);
    END LOOP;

    -- (1) احذف قيود الدفع المرتبطة بالفاتورة.
    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_payment'
       AND customer_id = v_inv.customer_id;
    GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

    -- (2) احذف قيود الرصيد الدائن المرتبطة بالفاتورة (فائض + عكس استهلاك).
    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_credit'
       AND customer_id = v_inv.customer_id;
    GET DIAGNOSTICS v_deleted_credits = ROW_COUNT;

    -- (3) أعِد حساب رصيد العميل والحسابات المتأثّرة.
    PERFORM public.recompute_customer_balance(v_inv.customer_id);
    IF array_length(v_account_ids, 1) > 0 THEN
      FOR r IN SELECT DISTINCT unnest(v_account_ids) AS aid LOOP
        PERFORM public.recompute_account_balance(r.aid);
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_inv.customer_id,
    'paid_amount', v_inv.paid_amount,
    'deleted_payments', v_deleted_payments,
    'deleted_credits', v_deleted_credits,
    'affected_accounts', COALESCE(array_length(v_account_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_with_reconciliation(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
