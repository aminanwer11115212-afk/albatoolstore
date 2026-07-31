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
