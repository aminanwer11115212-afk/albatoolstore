-- ============================================================
-- تعديل مبلغ/خصم دفعة فاتورة مسجّلة — ذرّياً مع إعادة حساب الحالة والأرصدة.
-- إضافية وآمنة: لا تغيّر أي سلوك قائم حتى تُستدعى من الواجهة.
--
-- المبدأ: نعدّل قيد الدفعة نفسه (نفس id، نفس account_id/method — أثر تدقيقي)،
-- ونُطابق paid_amount للفاتورة مع الفرق. حالة الفاتورة يعيد حسابها تلقائياً
-- trg_invoice_recompute_status، ورصيد العميل عبر triggers الأرصدة. نستدعي
-- recompute_account_balance صراحةً للحساب المتأثّر.
-- ============================================================
CREATE OR REPLACE FUNCTION public.revise_invoice_payment(
  _tx_id uuid,
  _new_amount numeric,
  _new_discount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx           record;
  v_inv          record;
  v_invoice_id   uuid;
  v_old_amount   numeric;
  v_pay_delta    numeric;
  v_old_discount numeric;
  v_new_discount numeric;
  v_disc_delta   numeric := 0;
  v_new_total    numeric;
  v_new_paid     numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _tx_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_tx_id');
  END IF;
  IF _new_amount IS NULL OR _new_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  -- قفل قيد الدفعة والتحقّق منه
  SELECT id, customer_id, account_id, amount, method, category, reference_id, description
    INTO v_tx
    FROM public.transactions
   WHERE id = _tx_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tx_not_found');
  END IF;
  IF v_tx.category <> 'customer_payment' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_payment');
  END IF;
  -- قيود استهلاك الرصيد الدائن (credit_balance) لا تُعدَّل هنا — أموال حقيقية فقط.
  IF COALESCE(v_tx.method, '') = 'credit_balance' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'credit_consumption_not_editable');
  END IF;
  IF v_tx.reference_id IS NULL OR v_tx.reference_id !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_linked_invoice');
  END IF;
  v_invoice_id := v_tx.reference_id::uuid;

  -- قفل الفاتورة
  SELECT id, invoice_number, COALESCE(total,0) AS total,
         COALESCE(paid_amount,0) AS paid_amount, COALESCE(discount,0) AS discount,
         COALESCE(status,'') AS status
    INTO v_inv
    FROM public.invoices
   WHERE id = v_invoice_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  END IF;
  IF v_inv.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_cancelled');
  END IF;

  v_old_amount   := COALESCE(v_tx.amount, 0);
  v_pay_delta    := _new_amount - v_old_amount;
  v_old_discount := v_inv.discount;

  -- الخصم (اختياري): زيادة الخصم تُنقص الإجمالي بنفس المقدار.
  IF _new_discount IS NOT NULL THEN
    IF _new_discount < 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_discount');
    END IF;
    v_new_discount := _new_discount;
    v_disc_delta   := v_new_discount - v_old_discount;
    v_new_total    := GREATEST(v_inv.total - v_disc_delta, 0);
  ELSE
    v_new_discount := v_old_discount;
    v_new_total    := v_inv.total;
  END IF;

  v_new_paid := v_inv.paid_amount + v_pay_delta;
  IF v_new_paid < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paid_would_be_negative');
  END IF;
  -- منع الدفع الزائد الصامت: استخدم شاشة الدفعة لتحويل الفائض إلى رصيد دائن.
  IF v_new_paid > v_new_total + 0.01 THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'would_overpay',
      'new_total', v_new_total, 'new_paid', v_new_paid
    );
  END IF;

  -- (1) عدّل قيد الدفعة نفسه (نحافظ على id/account/method/date للأثر التدقيقي).
  UPDATE public.transactions
     SET amount = _new_amount,
         credit = _new_amount,
         description = COALESCE(NULLIF(v_tx.description, ''), 'دفعة على الفاتورة ' || COALESCE(v_inv.invoice_number, v_invoice_id::text))
                     || ' — عُدِّلت (' || v_old_amount::text || ' → ' || _new_amount::text || ')',
         allocation = COALESCE(allocation, '{}'::jsonb) || jsonb_build_object(
           'revised', true,
           'revised_at', now(),
           'amount_before', v_old_amount,
           'amount_after', _new_amount
         )
   WHERE id = _tx_id;

  -- (2) طابق الفاتورة (paid_amount + الخصم/الإجمالي إن تغيّر). الحالة تُعاد
  --     تلقائياً عبر trg_invoice_recompute_status.
  UPDATE public.invoices
     SET paid_amount = v_new_paid,
         discount = v_new_discount,
         total = v_new_total,
         updated_at = now()
   WHERE id = v_invoice_id;

  -- (3) أعِد حساب الأرصدة (رصيد العميل تعيده triggers؛ نستدعي صراحةً للتأكيد).
  IF v_tx.customer_id IS NOT NULL THEN
    PERFORM public.recompute_customer_balance(v_tx.customer_id);
  END IF;
  IF v_tx.account_id IS NOT NULL THEN
    PERFORM public.recompute_account_balance(v_tx.account_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', _tx_id,
    'invoice_id', v_invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_tx.customer_id,
    'amount_before', v_old_amount,
    'amount_after', _new_amount,
    'discount_before', v_old_discount,
    'discount_after', v_new_discount,
    'total_before', v_inv.total,
    'total_after', v_new_total,
    'paid_before', v_inv.paid_amount,
    'paid_after', v_new_paid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revise_invoice_payment(uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_invoice_payment(uuid, numeric, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
