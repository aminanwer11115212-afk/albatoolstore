-- Update customer balance to also subtract customer credits (overpayments / advances)
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

  SELECT COALESCE(SUM(COALESCE(total,0) - COALESCE(paid_amount,0)), 0)
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
  SET balance = v_due - v_credit
  WHERE id = _customer_id;
END;
$$;

-- Recalc-all to also account for credits
CREATE OR REPLACE FUNCTION public.recalc_all_customer_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH due AS (
    SELECT customer_id, SUM(COALESCE(total,0) - COALESCE(paid_amount,0)) AS due
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
  ),
  combined AS (
    SELECT c.id AS customer_id,
           COALESCE(d.due, 0) - COALESCE(cr.credit, 0) AS bal
    FROM public.customers c
    LEFT JOIN due d ON d.customer_id = c.id
    LEFT JOIN credits cr ON cr.customer_id = c.id
  )
  UPDATE public.customers c
  SET balance = combined.bal
  FROM combined
  WHERE c.id = combined.customer_id;

  RETURN jsonb_build_object('ok', true, 'recalculated_at', now());
END;
$$;

-- Trigger on transactions for customer_credit changes
CREATE OR REPLACE FUNCTION public.sync_customer_balance_from_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.category = 'customer_credit' AND NEW.customer_id IS NOT NULL THEN
      PERFORM public.recalc_customer_balance(NEW.customer_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.category = 'customer_credit' AND OLD.customer_id IS NOT NULL THEN
      PERFORM public.recalc_customer_balance(OLD.customer_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.customer_id IS DISTINCT FROM NEW.customer_id)
       OR (OLD.category IS DISTINCT FROM NEW.category)
       OR (OLD.amount IS DISTINCT FROM NEW.amount)
       OR (OLD.type IS DISTINCT FROM NEW.type) THEN
      IF OLD.customer_id IS NOT NULL THEN
        PERFORM public.recalc_customer_balance(OLD.customer_id);
      END IF;
      IF NEW.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
        PERFORM public.recalc_customer_balance(NEW.customer_id);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_balance_credit ON public.transactions;
CREATE TRIGGER trg_sync_customer_balance_credit
AFTER INSERT OR UPDATE OR DELETE
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_balance_from_credit();

-- One-time recalc to apply new logic
SELECT public.recalc_all_customer_balances();