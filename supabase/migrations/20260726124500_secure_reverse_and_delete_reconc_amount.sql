-- ============================================================
-- [متوسط] تقييد reverse_customer_charge على الأغلفة الأدمنية فقط
--
-- reverse_customer_charge عملية هدّامة (تحذف مجموعة شحن وتعدّل paid_amount
-- للفواتير) لكنها كانت ممنوحة لكل authenticated بلا فحص admin، بينما غلافاها
-- cancel_customer_charge / revise_customer_charge يفرضان admin. أي مستخدم مسجّل
-- كان يستطيع تجاوز البوابة باستدعاء reverse مباشرةً.
--
-- الحل: REVOKE عن authenticated. تبقى قابلة للاستدعاء عبر الغلافين (SECURITY
-- DEFINER يعملان بصلاحية المالك) وعبر service_role. الواجهة تستدعي الآن
-- cancel_customer_charge (الأدمني)، وزر «إلغاء الشحنة» مخفيّ لغير الأدمن.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.reverse_customer_charge(uuid) FROM authenticated;
-- (service_role يحتفظ بالصلاحية للمسارات الخلفية؛ الأغلفة الأدمنية تستدعيها ذرّياً)

-- ============================================================
-- [منخفض] delete_invoice_with_reconciliation: إرجاع مبلغ الدفعات المحوّلة (لا العدد فقط)
--
-- سابقاً كانت تُرجع converted_payments = عدد الصفوف المحوّلة فقط، والواجهة
-- (deleteInvoice.ts) كانت تقرأ مفتاحاً غير موجود (deleted_payments) فتُسجّل 0
-- دائماً في سجل التدقيق و«المدفوع المُلغى». نُضيف converted_amount = مجموع
-- المبالغ المحوّلة إلى رصيد دائن لتُعرَض القيمة الصحيحة.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_invoice_with_reconciliation(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_credited numeric := 0;   -- عدد الصفوف المحوّلة
  v_amount   numeric := 0;   -- مجموع المبالغ المحوّلة
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

  IF v_inv.customer_id IS NOT NULL AND v_inv.paid_amount > 0.01 THEN
    -- مجموع ما سيُحوَّل (قبل التحويل) للأثر التدقيقي.
    SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
      INTO v_amount
      FROM public.transactions
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_payment'
       AND customer_id = v_inv.customer_id;

    UPDATE public.transactions
       SET category = 'customer_credit',
           reference_id = NULL,
           description = 'رصيد دائن من حذف الفاتورة ' || COALESCE(v_inv.invoice_number, _invoice_id::text)
                       || CASE WHEN description IS NOT NULL AND description <> ''
                               THEN ' — ' || description ELSE '' END,
           allocation = COALESCE(allocation, '{}'::jsonb) || jsonb_build_object(
             'converted_from', 'customer_payment',
             'deleted_invoice_id', _invoice_id,
             'deleted_invoice_number', v_inv.invoice_number,
             'converted_at', now()
           )
     WHERE reference_id = _invoice_id::text
       AND category = 'customer_payment'
       AND customer_id = v_inv.customer_id;
    GET DIAGNOSTICS v_credited = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_inv.customer_id,
    'paid_amount', v_inv.paid_amount,
    'converted_payments', v_credited,   -- عدد الصفوف (توافق خلفي)
    'converted_amount', v_amount        -- المبلغ المحوّل (جديد)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_with_reconciliation(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
