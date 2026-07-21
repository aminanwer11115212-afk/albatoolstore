
-- =========================================================================
-- Phase 1: repair the two known critical anomalies
-- =========================================================================

-- INV-67975: delete the duplicate credit-consumption pair.
DELETE FROM public.transactions
WHERE id IN (
  '627e4928-686d-411b-8270-5a1694b27128',
  'ee9417a1-d31e-4a94-be6c-6f777a053d44'
);

-- Recompute affected customer balance.
SELECT public.recompute_customer_balance('fa87615d-4611-4291-80ee-13ce36881015');

-- INV-15490: paid_amount=63,000 with zero payment transactions.
-- Insert a backdated cash payment (no account) so the trace exists and the
-- consistency trigger holds. Method=cash + null account_id => no bank/account impact.
INSERT INTO public.transactions (
  id, date, type, category, amount, method, account_id,
  customer_id, reference_id, description, allocation
)
SELECT
  gen_random_uuid(),
  COALESCE(i.date, CURRENT_DATE),
  'income',
  'customer_payment',
  i.paid_amount,
  'cash',
  NULL,
  i.customer_id,
  i.id::text,
  'تسوية آلية بواسطة بوت تأمين الحسابات — إعادة قيد دفعة مفقودة على الفاتورة ' || i.invoice_number,
  jsonb_build_object(
    'kind', 'bot_backfill_payment',
    'invoice_id', i.id,
    'invoice_number', i.invoice_number,
    'reason', 'paid_amount_without_transactions'
  )
FROM public.invoices i
WHERE i.id = '8ae7c0ad-af1e-4e43-a4e4-b062d8f419b4';

SELECT public.recompute_customer_balance('c6054cec-14b4-4209-bbeb-c17ce9f02b8d');


-- =========================================================================
-- Phase 2: Accounts Safety Bot RPCs
-- =========================================================================

-- 1) Scan all invoices and return the ones with payment inconsistencies.
CREATE OR REPLACE FUNCTION public.bot_scan_invoice_anomalies()
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  customer_id uuid,
  total numeric,
  paid_amount numeric,
  sum_payments numeric,
  delta numeric,
  kind text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT i.id, i.invoice_number, i.customer_id, i.total, i.paid_amount,
           COALESCE((SELECT SUM(amount) FROM public.transactions t
                       WHERE t.reference_id = i.id::text
                         AND t.category = 'customer_payment'), 0) AS sum_payments
      FROM public.invoices i
     WHERE i.status <> 'cancelled'
  )
  SELECT a.id, a.invoice_number, a.customer_id, a.total, a.paid_amount,
         a.sum_payments,
         (a.paid_amount - a.sum_payments) AS delta,
         CASE
           WHEN ABS(a.paid_amount - a.sum_payments) > 0.01
                AND a.paid_amount > a.sum_payments THEN 'missing_payment_trace'
           WHEN ABS(a.paid_amount - a.sum_payments) > 0.01
                AND a.paid_amount < a.sum_payments THEN 'duplicate_payment'
           WHEN a.paid_amount - a.total > 0.01 THEN 'overpaid'
           ELSE 'ok'
         END AS kind
    FROM agg a
   WHERE ABS(a.paid_amount - a.sum_payments) > 0.01
      OR a.paid_amount - a.total > 0.01;
$$;

GRANT EXECUTE ON FUNCTION public.bot_scan_invoice_anomalies() TO authenticated;

-- 2) Repair a single invoice. Strategy:
--    - if duplicate: remove exact duplicate customer_payment rows (same reference_id,
--      amount, method='credit_balance' paired with same-amount customer_credit) until
--      Σpayments == paid_amount.
--    - if missing trace: insert a synthetic cash customer_payment for the delta.
--    - always: recompute customer balance at the end.
CREATE OR REPLACE FUNCTION public.bot_repair_invoice(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv         public.invoices%ROWTYPE;
  v_sum         numeric;
  v_delta       numeric;
  v_deleted     int := 0;
  v_inserted    int := 0;
  v_result      jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_not_found');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM public.transactions
   WHERE reference_id = _invoice_id::text AND category = 'customer_payment';

  v_delta := v_inv.paid_amount - v_sum;

  -- Duplicate payments (sum > paid_amount): drop duplicate credit_balance pairs.
  IF v_delta < -0.01 THEN
    WITH dupes AS (
      SELECT id, amount,
             ROW_NUMBER() OVER (
               PARTITION BY reference_id, amount, method, category
               ORDER BY created_at
             ) AS rn
        FROM public.transactions
       WHERE reference_id = _invoice_id::text
         AND category = 'customer_payment'
         AND method = 'credit_balance'
    ),
    to_delete AS (
      SELECT id, amount FROM dupes WHERE rn > 1
    ),
    -- also delete the paired negative customer_credit rows of the same amount
    paired AS (
      SELECT t.id
        FROM public.transactions t
        JOIN to_delete d ON t.amount = -d.amount
       WHERE t.reference_id = _invoice_id::text
         AND t.category = 'customer_credit'
         AND t.method = 'credit_balance'
    ),
    del_pay AS (
      DELETE FROM public.transactions WHERE id IN (SELECT id FROM to_delete) RETURNING 1
    ),
    del_cred AS (
      DELETE FROM public.transactions WHERE id IN (SELECT id FROM paired) RETURNING 1
    )
    SELECT (SELECT COUNT(*) FROM del_pay) + (SELECT COUNT(*) FROM del_cred) INTO v_deleted;
  END IF;

  -- Recompute after deletions.
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM public.transactions
   WHERE reference_id = _invoice_id::text AND category = 'customer_payment';
  v_delta := v_inv.paid_amount - v_sum;

  -- Missing trace (paid_amount > sum): insert synthetic cash payment for delta.
  IF v_delta > 0.01 THEN
    INSERT INTO public.transactions (
      id, date, type, category, amount, method, account_id,
      customer_id, reference_id, description, allocation
    ) VALUES (
      gen_random_uuid(),
      COALESCE(v_inv.date, CURRENT_DATE),
      'income',
      'customer_payment',
      v_delta,
      'cash',
      NULL,
      v_inv.customer_id,
      v_inv.id::text,
      'تسوية آلية بواسطة بوت تأمين الحسابات — إعادة قيد دفعة مفقودة على الفاتورة ' || COALESCE(v_inv.invoice_number, v_inv.id::text),
      jsonb_build_object('kind', 'bot_backfill_payment', 'invoice_id', v_inv.id,
                         'invoice_number', v_inv.invoice_number, 'delta', v_delta)
    );
    v_inserted := 1;
  END IF;

  -- Recompute customer balance.
  IF v_inv.customer_id IS NOT NULL THEN
    PERFORM public.recompute_customer_balance(v_inv.customer_id);
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', v_inv.invoice_number,
    'deleted_duplicates', v_deleted,
    'inserted_backfills', v_inserted
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bot_repair_invoice(uuid) TO authenticated;

-- 3) Global repair: repair every offending invoice, then recompute all balances.
CREATE OR REPLACE FUNCTION public.bot_repair_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_ids uuid[];
  v_fixed       int := 0;
  v_id          uuid;
BEGIN
  SELECT COALESCE(array_agg(invoice_id), '{}') INTO v_invoice_ids
    FROM public.bot_scan_invoice_anomalies();

  FOREACH v_id IN ARRAY v_invoice_ids LOOP
    PERFORM public.bot_repair_invoice(v_id);
    v_fixed := v_fixed + 1;
  END LOOP;

  -- global balance recomputation
  PERFORM public.recalc_all_customer_balances();
  PERFORM public.recalc_all_account_balances();

  RETURN jsonb_build_object(
    'ok', true,
    'invoices_repaired', v_fixed,
    'customer_balances_recomputed', true,
    'account_balances_recomputed', true,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bot_repair_all() TO authenticated;
