-- ============================================================
-- حذف الفاتورة: عكس متماثل وكامل للأثر المالي (نسخة محسّنة).
--
-- المشكلة السابقة: قيود استهلاك الرصيد الدائن مربوطة دائماً بالفاتورة
-- (reference_id) فتُعكَس عند الحذف، لكن قيد "الفائض" (overpay) في البيانات
-- القديمة قد يكون غير مربوط، فيبقى ولا يُعكَس → عدم تماثل يترك رصيداً زائداً.
--
-- الحل: عند الحذف نعكس:
--   • كل قيود الدفع (customer_payment) المرتبطة بالفاتورة.
--   • كل قيود الرصيد الدائن (customer_credit) المرتبطة صراحةً (reference_id).
--   • الفائض غير المربوط (البيانات القديمة) — يُطابَق بوصفه "فائض دفعة" مع
--     ظهور رقم الفاتورة في الوصف، لنفس العميل.
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
  v_deleted_legacy   int := 0;
  v_account_ids uuid[] := ARRAY[]::uuid[];
  v_num text;
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
    v_num := NULLIF(btrim(COALESCE(v_inv.invoice_number, '')), '');

    -- اجمع الحسابات المتأثّرة قبل الحذف (من الدفعات + الرصيد المربوط + الفائض القديم).
    FOR r IN
      SELECT DISTINCT account_id FROM public.transactions
       WHERE customer_id = v_inv.customer_id
         AND account_id IS NOT NULL
         AND (
           (reference_id = _invoice_id::text AND category IN ('customer_payment','customer_credit'))
           OR (v_num IS NOT NULL AND category = 'customer_credit' AND reference_id IS NULL
               AND amount > 0 AND description LIKE '%فائض دفعة%'
               AND COALESCE(description,'') LIKE '%الفاتورة ' || v_num || ' %')
         )
    LOOP
      v_account_ids := array_append(v_account_ids, r.account_id);
    END LOOP;

    -- (1) قيود الدفع المرتبطة بالفاتورة.
    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_payment'
       AND customer_id = v_inv.customer_id;
    GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

    -- (2) قيود الرصيد الدائن المرتبطة صراحةً بالفاتورة (فائض جديد + عكس استهلاك).
    DELETE FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_credit'
       AND customer_id = v_inv.customer_id;
    GET DIAGNOSTICS v_deleted_credits = ROW_COUNT;

    -- (3) الفائض القديم غير المربوط (يُطابَق بالوصف "فائض دفعة" + رقم الفاتورة).
    IF v_num IS NOT NULL THEN
      DELETE FROM public.transactions
       WHERE customer_id = v_inv.customer_id
         AND category = 'customer_credit'
         AND reference_id IS NULL
         AND amount > 0
         AND description LIKE '%فائض دفعة%'
         AND COALESCE(description, '') LIKE '%الفاتورة ' || v_num || ' %';
      GET DIAGNOSTICS v_deleted_legacy = ROW_COUNT;
    END IF;

    -- (4) أعِد حساب رصيد العميل والحسابات المتأثّرة.
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
    'deleted_credits', v_deleted_credits + v_deleted_legacy,
    'affected_accounts', COALESCE(array_length(v_account_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_with_reconciliation(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
