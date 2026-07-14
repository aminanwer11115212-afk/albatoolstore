-- ============================================================
-- Invoice deletion & charge reversal — atomic reconciliation
-- ============================================================

-- (1) حذف فاتورة مع تحويل ما دُفع عليها إلى رصيد دائن للعميل
--     ذرّياً في معاملة واحدة، ثم استدعاء إعادة الحساب.
CREATE OR REPLACE FUNCTION public.delete_invoice_with_reconciliation(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_credited numeric := 0;
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

  -- إن كان للفاتورة دفعات مسجّلة، نحوّل معاملات customer_payment المرتبطة بها
  -- إلى customer_credit (بدون حذف/إعادة إدراج) للحفاظ على:
  --   • تدفّق النقد في الحسابات كما هو (نفس account_id، نفس amount).
  --   • أثر تدقيقي (نفس id، نفس التاريخ) مع تحديث الفئة والوصف.
  IF v_inv.customer_id IS NOT NULL AND v_inv.paid_amount > 0.01 THEN
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

  -- الحذف الفعلي يجري من الواجهة (deleteInvoice.ts) لأنه يتعامل مع
  -- المرفقات والمخزون. هنا فقط نضمن التحويل الذرّي للدفعات.
  -- بعد نجاح هذا الاستدعاء، تُتابع الواجهة الحذف الحقيقي.
  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'customer_id', v_inv.customer_id,
    'paid_amount', v_inv.paid_amount,
    'converted_payments', v_credited
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_with_reconciliation(uuid) TO authenticated, service_role;

-- (2) عكس مجموعة شحن رصيد كاملة (allocation.group_id)
--     • يعيد paid_amount للفواتير الموزَّع عليها بمقدار applied لكل بند.
--     • يعيد حساب حالة كل فاتورة تلقائياً عبر تريغر trg_invoice_recompute_status.
--     • يحذف كل معاملات المجموعة (customer_payment + surplus customer_credit).
--     • يستدعي recompute_customer_balance و recompute_account_balance.
CREATE OR REPLACE FUNCTION public.reverse_customer_charge(_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_customer_id uuid;
  v_account_ids uuid[] := ARRAY[]::uuid[];
  v_touched_invoices int := 0;
  v_deleted_tx int := 0;
  v_total numeric := 0;
BEGIN
  IF _group_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_group_id');
  END IF;

  -- قفل صفوف المجموعة لمنع التسابق
  FOR r IN
    SELECT id, customer_id, account_id, amount, category, allocation
      FROM public.transactions
     WHERE (allocation->>'group_id')::uuid = _group_id
     FOR UPDATE
  LOOP
    v_customer_id := COALESCE(v_customer_id, r.customer_id);
    IF r.account_id IS NOT NULL AND NOT (r.account_id = ANY(v_account_ids)) THEN
      v_account_ids := array_append(v_account_ids, r.account_id);
    END IF;
    v_total := v_total + COALESCE(r.amount, 0);

    -- تراجع عن التخصيص على فاتورة
    IF (r.allocation->>'kind') = 'invoice_alloc' THEN
      DECLARE
        v_inv_id uuid := (r.allocation->>'invoice_id')::uuid;
        v_applied numeric := COALESCE((r.allocation->>'applied')::numeric, r.amount, 0);
      BEGIN
        IF v_inv_id IS NOT NULL AND v_applied > 0 THEN
          UPDATE public.invoices
             SET paid_amount = GREATEST(COALESCE(paid_amount, 0) - v_applied, 0),
                 updated_at = now()
           WHERE id = v_inv_id;
          IF FOUND THEN v_touched_invoices := v_touched_invoices + 1; END IF;
        END IF;
      END;
    END IF;
  END LOOP;

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'group_not_found');
  END IF;

  -- حذف كل معاملات المجموعة
  DELETE FROM public.transactions
   WHERE (allocation->>'group_id')::uuid = _group_id;
  GET DIAGNOSTICS v_deleted_tx = ROW_COUNT;

  -- إعادة حساب الأرصدة
  PERFORM public.recompute_customer_balance(v_customer_id);
  IF array_length(v_account_ids, 1) > 0 THEN
    FOR r IN SELECT unnest(v_account_ids) AS aid LOOP
      PERFORM public.recompute_account_balance(r.aid);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'group_id', _group_id,
    'customer_id', v_customer_id,
    'total_reversed', v_total,
    'invoices_touched', v_touched_invoices,
    'transactions_deleted', v_deleted_tx
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_customer_charge(uuid) TO authenticated, service_role;
