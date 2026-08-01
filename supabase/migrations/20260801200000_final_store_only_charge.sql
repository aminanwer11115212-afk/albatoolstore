-- ============================================================
-- القول الفصل: شحن الرصيد يُخزَّن ولا يُوزَّع — نهائياً
--
-- هجرة `20260731215118` (كتبها Lovable) أعادت التوزيع التلقائي إلى
-- `record_customer_charge`، فعاد الشحن يسدّد الفواتير من تلقائه خلافاً
-- للسياسة المطلوبة. هذه الهجرة **تأتي بعدها زمنياً** فتكون هي التعريف الحيّ.
--
-- طُبِّق مضمونها يدوياً على القاعدة المنشورة بتاريخ 2026-08-01، وهذه نسختها
-- في المستودع حتى لا يعيد أي إعادة تشغيل للهجرات التوزيعَ من جديد.
--
-- السلوك: الشحن يُقيَّد رصيداً دائناً كاملاً على مستوى العميل — يزيد رصيده
-- ويُخصم من صافي حسابه في كشف الحساب مباشرةً — ولا يمسّ `paid_amount` ولا
-- حالة أي فاتورة. التوزيع يدوي من كشف الحساب وحده عبر
-- `apply_customer_credit_to_invoice` أو `settle_invoices_from_credit`.
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
