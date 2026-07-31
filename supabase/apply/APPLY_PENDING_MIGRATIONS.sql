-- ============================================================================
--  طبّق هذا الملف مرّة واحدة في SQL Editor بلوحة Supabase
--  https://supabase.com/dashboard/project/exmasfdcjgwapmobefne/sql/new
--
--  يجمع كل الهجرات المعلّقة التي لم تُطبَّق على القاعدة المنشورة، **بترتيبها**.
--  كلها `CREATE OR REPLACE` فآمنة التكرار: شغّلها مرّة أو عشراً، النتيجة واحدة.
--
--  ملاحظة على الترتيب: `record_customer_charge` تُعرَّف مرّتين — الأخيرة
--  (التوزيع التلقائي) هي التي تبقى، وهي المقصودة.
--
--  بعد التشغيل:
--    • تختفي رسالة Could not find the function delete_customer_credit_entry
--    • شحن الرصيد يُوزَّع تلقائياً على الفواتير الأقدم أولاً
--    • حذف الفاتورة يمحو دفعتها ولا يعيدها رصيداً
--    • أي شحنة تُحذف ولو استُهلك منها (يُعكَس الاستهلاك أولاً)
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════
--  20260730120000_delete_customer_credit_entry.sql
-- ══════════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════════
--  20260731000000_force_charge_store_only.sql
-- ══════════════════════════════════════════════════════════════════

-- ============================================================
-- إلغاء الدفع التلقائي للفواتير عند شحن رصيد العميل — نهائياً.
--
-- الملاحظ في بيانات حقيقية: شحن رصيد 800,000 أنشأ فوراً قيود سداد على
-- الفواتير في نفس الدقيقة («سُدّد 30,000 من الرصيد …»). سبب ذلك أن قاعدة
-- البيانات المنشورة ما زالت تشغّل النسخة القديمة الموزِّعة من دوال الشحن —
-- هجرة `20260726120000_record_customer_charge_store_only.sql` لم تُطبَّق عليها.
--
-- هذه الهجرة تُعيد تعريف **الدالتين** معاً بصيغة «تخزين فقط»، وهي
-- `CREATE OR REPLACE` أي تُصلح القاعدة أياً كانت النسخة الموجودة عليها الآن:
--   • `record_customer_charge`   — المسار الذي تستدعيه الواجهة.
--   • `allocate_customer_charge` — المسار القديم الموزِّع (FIFO)؛ يبقى موجوداً
--     للتوافق مع أي استدعاء قديم لكنه لم يعد يوزّع شيئاً.
--
-- بعدها: شحن الرصيد يُخزَّن كرصيد دائن كامل على مستوى العميل، ولا تتغيّر
-- حالة أي فاتورة ولا `paid_amount` إلا بسداد يدوي صريح من كشف حساب العميل
-- عبر `apply_customer_credit_to_invoice`.
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

-- ============================================================
-- المسار القديم الموزِّع: يُحوَّل إلى تخزين فقط عبر تفويضه للدالة أعلاه،
-- فلا يبقى في القاعدة أي مسار يوزّع الشحن على الفواتير تلقائياً.
-- ============================================================
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

-- ══════════════════════════════════════════════════════════════════
--  20260801100000_auto_distribute_charge.sql
-- ══════════════════════════════════════════════════════════════════

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
