-- ============================================================
-- حذف شحن رصيد للعميل من تبويب «سجل المعاملات» في كشف حساب العميل.
--
-- القواعد (مطابقة لما تفرضه الواجهة في src/utils/ledgerEntryActions.ts):
--   • مدير النظام فقط.
--   • القيد يجب أن يكون customer_credit بمبلغ موجب (شحن رصيد لا استهلاك).
--   • شحن استُهلك جزئياً أو كلياً: يُمنع الحذف المباشر وتُعاد قيمة الاستهلاك
--     ليعرض عليها الواجهة رسالة «راجع الاستهلاك أولاً».
--   • الحذف من `transactions` فقط — لا كتابة يدوية على `customers.balance`؛
--     trigger `trg_tx_recompute_cust_balance` هو من يعيد الحساب.
--   • شحنة ذات مجموعة (`allocation.group_id`) تُعكَس عبر reverse_customer_charge
--     حتى لا تبقى بقية صفوف المجموعة يتيمة بعد حذف صف واحد منها.
--   • كل حذف يُسجَّل في `activity_log` بنفس نمط حذف الفواتير.
--
-- تُرجع الرصيد الصافي قبل وبعد لتعرضه الواجهة في تأكيد ما بعد التنفيذ.
-- ============================================================

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
  --     إن قلّ عن قيمة الشحنة فقد استُهلك منها ولو بلا ربط صريح.
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

-- ============================================================
-- فهرس أداء لحارس الاستهلاك ولملخّصات الرصيد الدائن.
--
-- موجود مسبقاً ويغطي بقية استعلامات كشف الحساب (لا نكرّره):
--   idx_transactions_customer_date   (customer_id, date DESC)
--   idx_transactions_reference_type  (reference_id, type)
--   idx_invoices_customer_date       (customer_id, date DESC)
--
-- الناقص هو تصفية معاملات العميل حسب الفئة — يستعملها الحارس أعلاه
-- (customer_credit للعميل الواحد) وتبويب المعاملات وملخّص مصادر الرصيد،
-- وتزداد كلفتها مع نمو الجدول لأنها اليوم تقرأ كل صفوف العميل ثم تُصفّي.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_customer_category
  ON public.transactions (customer_id, category)
  WHERE customer_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- فهرس كان مقصوداً ولم يُنشَأ أبداً.
--
-- هجرة 20260607141228 أعادت تعريف `idx_data_anomalies_status` بأعمدة أوسع
-- (status, severity, last_seen_at DESC)، لكن `CREATE INDEX IF NOT EXISTS`
-- يطابق **بالاسم فقط**، والاسم كان موجوداً من هجرة 20260502051022 بعمود
-- واحد — فمرّت التعليمة بصمت وبقي الفهرس أحادي العمود. نُنشئ المُركَّب باسم
-- مستقل حتى يوجد فعلاً.
--
-- (تعارض ثانٍ مقصود إبقاؤه: `idx_purchase_attachments_order` المعرَّف
--  (purchase_order_id, deleted_at) يغطي البحث بـ purchase_order_id وحده،
--  فلا حاجة لفهرس إضافي.)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_data_anomalies_status_severity_seen
  ON public.data_anomalies (status, severity, last_seen_at DESC);
