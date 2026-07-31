-- ============================================================
-- حذف الفاتورة يمحو دفعتها ولا يعيدها رصيداً + حذف أي شحنة رصيد
--
-- ## ما كان يحدث ولماذا هو خطأ
-- `delete_invoice_with_reconciliation` كانت **تحوّل** دفعات الفاتورة إلى
-- `customer_credit` بدل حذفها. فحذف فاتورة مدفوعة كان يُرجع مبلغها رصيداً
-- دائناً للعميل يظهر في كشف حسابه — والمطلوب أن يُمحى المبلغ كما تُمحى
-- الفاتورة، فالعملية كلّها لم تحدث.
--
-- ## ما تفعله هذه الهجرة
--   1. `delete_invoice_with_reconciliation` → تحذف قيود الدفع نهائياً، وتحتفظ
--      بلقطة كاملة منها في `activity_log` وحدها للأثر التدقيقي.
--   2. `delete_customer_credit_entry` → تحذف **أي** شحنة، حتى المستهلَكة:
--      تعكس استهلاكها على الفواتير أولاً (تُنقص `paid_amount` وتعيد الحالة)
--      ثم تحذف المجموعة. لم يعد الاستهلاك مانعاً بل خطوةً تسبق الحذف.
--
-- إرجاع المخزون يتولّاه `deleteInvoiceWithStockRestore` في الواجهة كما هو.
-- ============================================================

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

  -- الحذف النهائي: الدفعات وقيود الرصيد المرتبطة بهذه الفاتورة معاً، فلا يبقى
  -- نصف عملية (فائض بلا فاتورته، أو استهلاك بلا سداده).
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
    -- توافق خلفي مع مستدعٍ قديم يقرأ هذين المفتاحين
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

  -- (أ) اعكس ما استُهلك من هذه الشحنة على الفواتير: أنقص `paid_amount` وأعد
  --     حالة الفاتورة، ثم احذف زوج قيدَي الاستهلاك. الاستهلاك لم يعد مانعاً
  --     للحذف بل خطوة تسبقه، فتُحذف الشحنة كاملةً بلا أثر معلّق.
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
