-- ============================================================================
--  فحص وإصلاح: هل التوزيع التلقائي حيّ في القاعدة؟
--
--  السياق: ملف `APPLY_PENDING_MIGRATIONS.sql` حمل لفترة وجيزة هجرةَ توزيعٍ
--  تلقائي ثم أُلغيت. من طبّق الملف في تلك الفترة صار عنده `record_customer_charge`
--  الموزِّعة — وهي ليست السلوك المطلوب.
--
--  شغّل القسم (1) أولاً وانظر النتيجة. إن قال «AUTO_DISTRIBUTE» شغّل (2) ثم (3).
-- ============================================================================


-- ─────────────────────────────────────────────────────────────
-- (1) ما هي النسخة الحيّة الآن؟  ← شغّل هذا وحده أولاً
-- ─────────────────────────────────────────────────────────────
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%UPDATE public.invoices%'
      THEN '⚠️ AUTO_DISTRIBUTE — الشحن يوزّع تلقائياً (غير مطلوب)'
    WHEN pg_get_functiondef(p.oid) ILIKE '%stored_only%'
      THEN '✅ STORE_ONLY — الشحن يُخزَّن ولا يوزّع (المطلوب)'
    ELSE '❓ نسخة غير معروفة'
  END AS "حالة record_customer_charge"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_customer_charge';


-- ─────────────────────────────────────────────────────────────
-- (2) هل وقع توزيع تلقائي فعلاً على بيانات حقيقية؟
--     القيود التي كتبها التوزيع التلقائي تحمل allocation->>'auto' = 'true'.
-- ─────────────────────────────────────────────────────────────
SELECT
  t.customer_id,
  c.name                              AS "العميل",
  COUNT(*) FILTER (WHERE t.category = 'customer_payment') AS "دفعات تلقائية",
  SUM(t.amount) FILTER (WHERE t.category = 'customer_payment') AS "المبلغ الموزَّع",
  MIN(t.date)                         AS "من",
  MAX(t.date)                         AS "إلى"
FROM public.transactions t
LEFT JOIN public.customers c ON c.id = t.customer_id
WHERE (t.allocation->>'auto') = 'true'
GROUP BY t.customer_id, c.name
ORDER BY 4 DESC NULLS LAST;
-- لا صفوف = لم يقع توزيع تلقائي على بيانات حقيقية، ويكفيك القسم (3).


-- ─────────────────────────────────────────────────────────────
-- (3) الإصلاح: أعِد `record_customer_charge` إلى «تخزين فقط»
--     نسخة مطابقة لـ 20260731000000_force_charge_store_only.sql
-- ─────────────────────────────────────────────────────────────
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

-- المسار القديم يبقى مفوّضاً لها فلا يوزّع هو الآخر.
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


-- ─────────────────────────────────────────────────────────────
-- (4) بعد الإصلاح: أعِد تشغيل القسم (1) — يجب أن يقول STORE_ONLY
-- ─────────────────────────────────────────────────────────────
--
-- ملاحظة على القسم (2): إن وجدتَ صفوفاً، فتلك عمليات سداد وقعت فعلاً على
-- فواتير. **لا تحذفها بجملة SQL عامة** — احذف كل شحنة من نافذة «الحركات
-- المالية» في كشف الحساب: مسار الحذف يعكس السداد ويعيد حالة الفاتورة
-- ويحفظ الأثر التدقيقي، وهو ما لا يفعله حذف يدوي بالجملة.
