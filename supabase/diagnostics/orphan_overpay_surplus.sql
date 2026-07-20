-- ============================================================================
-- تنظيف "الفائض اليتيم" — رصيد دائن ناتج عن دفع زائد لفاتورة حُذفت لاحقاً
-- دون أن يُعكَس الفائض (بيانات قديمة قبل إصلاح منطق الحذف).
--
-- شغّله في محرّر SQL في Supabase. الخطوة (1) للقراءة فقط. راجع النتائج، ثم
-- نفّذ الخطوة (2) لإزالة الفائض اليتيم وإعادة حساب رصيد العميل.
-- ============================================================================

-- (1) عرض الفوائض اليتيمة: قيد "فائض دفعة" لا تُوجد فاتورته.
SELECT
  t.id            AS tx_id,
  c.name          AS customer,
  t.customer_id,
  t.amount,
  t.date,
  t.reference_id,
  t.description
FROM public.transactions t
LEFT JOIN public.customers c ON c.id = t.customer_id
WHERE t.category = 'customer_credit'
  AND t.amount > 0
  AND t.description LIKE '%فائض دفعة%'
  AND (
    t.reference_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id::text = t.reference_id
    )
  )
ORDER BY t.date DESC;

-- (2) التنظيف (نفّذه بعد التأكد من نتائج الخطوة 1):
--     يحذف الفوائض اليتيمة ويعيد حساب رصيد كل عميل متأثّر.
-- ملاحظة: أزِل التعليق عن الكتلة التالية لتشغيلها.
/*
DO $$
DECLARE
  v_cust uuid;
  v_custs uuid[];
BEGIN
  -- اجمع العملاء المتأثّرين
  SELECT array_agg(DISTINCT t.customer_id) INTO v_custs
  FROM public.transactions t
  WHERE t.category = 'customer_credit'
    AND t.amount > 0
    AND t.description LIKE '%فائض دفعة%'
    AND (t.reference_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.invoices i WHERE i.id::text = t.reference_id));

  -- احذف الفوائض اليتيمة
  DELETE FROM public.transactions t
  WHERE t.category = 'customer_credit'
    AND t.amount > 0
    AND t.description LIKE '%فائض دفعة%'
    AND (t.reference_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.invoices i WHERE i.id::text = t.reference_id));

  -- أعِد حساب رصيد كل عميل متأثّر
  IF v_custs IS NOT NULL THEN
    FOREACH v_cust IN ARRAY v_custs LOOP
      PERFORM public.recompute_customer_balance(v_cust);
    END LOOP;
  END IF;
END $$;
*/
