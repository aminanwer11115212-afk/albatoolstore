-- Add credit_balance column to customers
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS credit_balance numeric NOT NULL DEFAULT 0;

-- recalc one customer: balance = pure debt (>=0), credit_balance = sum of customer_credit transactions
CREATE OR REPLACE FUNCTION public.recalc_customer_balance(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due numeric := 0;
  v_credit numeric := 0;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)), 0)
    INTO v_due
  FROM public.invoices
  WHERE customer_id = _customer_id;

  SELECT COALESCE(SUM(COALESCE(amount,0)), 0)
    INTO v_credit
  FROM public.transactions
  WHERE customer_id = _customer_id
    AND type = 'income'
    AND category = 'customer_credit';

  UPDATE public.customers
  SET balance = v_due,
      credit_balance = v_credit
  WHERE id = _customer_id;
END;
$$;

-- recalc all
CREATE OR REPLACE FUNCTION public.recalc_all_customer_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH due AS (
    SELECT customer_id, SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)) AS due
    FROM public.invoices
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  ),
  credits AS (
    SELECT customer_id, SUM(COALESCE(amount,0)) AS credit
    FROM public.transactions
    WHERE customer_id IS NOT NULL
      AND type = 'income'
      AND category = 'customer_credit'
    GROUP BY customer_id
  )
  UPDATE public.customers c
  SET balance = COALESCE(d.due, 0),
      credit_balance = COALESCE(cr.credit, 0)
  FROM (SELECT id FROM public.customers) ids
  LEFT JOIN due d ON d.customer_id = ids.id
  LEFT JOIN credits cr ON cr.customer_id = ids.id
  WHERE c.id = ids.id;

  RETURN jsonb_build_object('ok', true, 'recalculated_at', now());
END;
$$;

-- Apply new logic to existing data
SELECT public.recalc_all_customer_balances();