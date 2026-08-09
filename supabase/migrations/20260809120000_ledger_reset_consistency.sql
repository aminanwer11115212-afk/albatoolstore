-- ============================================================
-- تصفير كشف الحساب كان يسقط بحارس التناسق ولا يُنفَّذ
-- ============================================================
--
-- ## العطل
-- `admin_reset_stock_and_ledgers` في فرع «تصفير كشف الحساب» (ledger) كان:
--   1. يحذف كل حركات customer_payment / customer_credit
--   2. يكتب على كل فاتورة غير نقدية: paid_amount = total والحالة «مدفوعة»
--
-- وبعد إضافة الحارس `trg_invoices_payment_consistency` — وهو
-- CONSTRAINT TRIGGER **مؤجَّل حتى COMMIT** على `UPDATE OF paid_amount` —
-- صار هذا الترتيب متناقضاً: عند COMMIT يفحص الحارسُ كل فاتورة مُحدَّثة
-- فيجد paid_amount=total بينما Σ(الدفعات)=0 (حُذفت في الخطوة 1)، فيرفع
-- `inconsistent_invoice_payment` **ويُلغى التصفير كلُّه**.
--
-- فالمستخدم يضغط «تصفير كشف حساب كل العملاء» فلا يحدث شيء ويعود خطأ.
--
-- ## الإصلاح
-- بعد تعليم الفاتورة مدفوعةً، نُدرج لكل فاتورة **قيدَ تسويةٍ واحداً** بقيمة
-- إجماليها — تماماً كما يفعل «بوت تأمين الحسابات» حين يُصلح فاتورةً
-- بـ paid_amount بلا دفعات (راجع 20260721081856). فيصير Σ(الدفعات) =
-- paid_amount = total، ويمرّ الحارس، ويبقى للتسوية أثرٌ متتبَّع في الكشف.
--
-- method='cash' و account_id=NULL: لا أثر على أي حساب بنكي، مجرّد قيدٍ
-- يوازن الفاتورة. والرصيد النهائي صفر لأن recompute يقرأ (total − paid_amount)=0.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_reset_stock_and_ledgers(_scope jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_stock boolean := COALESCE((_scope->>'stock')::boolean, false);
  v_ledger boolean := COALESCE((_scope->>'ledger')::boolean, false);
  v_result jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- 1) تصفير كميات كل المنتجات
  IF v_stock THEN
    UPDATE public.products
       SET stock_quantity = 0,
           updated_at = now()
     WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('products_zeroed', v_n);
  END IF;

  -- 2) تصفير كشف حساب العملاء بالكامل عبر النظام
  IF v_ledger THEN
    -- (أ) حذف الدفعات والأرصدة الدائنة القائمة
    DELETE FROM public.transactions
     WHERE category IN ('customer_payment', 'customer_credit');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('customer_txs_deleted', v_n);

    -- (ب) تعليم كل الفواتير غير النقدية مدفوعةً بالكامل
    UPDATE public.invoices
       SET paid_amount = COALESCE(total, 0),
           status = CASE WHEN COALESCE(status,'') = 'cancelled' THEN status ELSE 'paid' END,
           updated_at = now()
     WHERE COALESCE(source,'') <> 'pos';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('invoices_marked_paid', v_n);

    -- (ج) قيدُ تسويةٍ لكل فاتورة حتى يوازن Σ(الدفعات) = paid_amount،
    --     وإلا رفع الحارسُ المؤجَّل `inconsistent_invoice_payment` عند COMMIT
    --     فأُلغي التصفيرُ كلُّه. (نفس نمط بوت تأمين الحسابات.)
    INSERT INTO public.transactions (
      id, date, type, category, amount, method, account_id,
      customer_id, reference_id, description, allocation
    )
    SELECT
      gen_random_uuid(),
      COALESCE(i.date, CURRENT_DATE),
      'income',
      'customer_payment',
      COALESCE(i.total, 0),
      'cash',
      NULL,
      i.customer_id,
      i.id::text,
      'تسوية تصفير كشف الحساب — الفاتورة ' || COALESCE(i.invoice_number, ''),
      jsonb_build_object(
        'kind', 'ledger_reset_settlement',
        'invoice_id', i.id,
        'invoice_number', i.invoice_number
      )
    FROM public.invoices i
    WHERE COALESCE(i.source,'') <> 'pos'
      AND COALESCE(i.status,'') <> 'cancelled'
      AND COALESCE(i.total, 0) > 0;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('settlements_inserted', v_n);

    -- (د) تصفير الأرصدة صراحةً ثم إعادة الحساب (ستبقى صفراً)
    UPDATE public.customers
       SET balance = 0,
           credit_balance = 0,
           updated_at = now()
     WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_result := v_result || jsonb_build_object('customers_zeroed', v_n);

    PERFORM public.recompute_customer_balance(id) FROM public.customers;
  END IF;

  RETURN jsonb_build_object('ok', true, 'at', now(), 'scope', _scope, 'counts', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_stock_and_ledgers(jsonb) TO authenticated;
