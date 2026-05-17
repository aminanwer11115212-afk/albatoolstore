-- ============================================================
-- Customer balance auto-sync from invoices
-- balance = SUM(invoices.total - COALESCE(invoices.paid_amount, 0))
-- ============================================================

-- 1) Recalculate function for a specific customer
CREATE OR REPLACE FUNCTION public.recalc_customer_balance(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;
  UPDATE public.customers
  SET balance = COALESCE((
    SELECT SUM(COALESCE(total,0) - COALESCE(paid_amount,0))
    FROM public.invoices
    WHERE customer_id = _customer_id
  ), 0)
  WHERE id = _customer_id;
END;
$$;

-- 2) Recalculate ALL customers (manual / one-time / RPC)
CREATE OR REPLACE FUNCTION public.recalc_all_customer_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  WITH due AS (
    SELECT customer_id, SUM(COALESCE(total,0) - COALESCE(paid_amount,0)) AS due
    FROM public.invoices
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  )
  UPDATE public.customers c
  SET balance = COALESCE(due.due, 0)
  FROM due
  WHERE c.id = due.customer_id;

  -- zero-out customers that no longer have invoices
  UPDATE public.customers
  SET balance = 0
  WHERE id NOT IN (SELECT customer_id FROM public.invoices WHERE customer_id IS NOT NULL)
    AND balance <> 0;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'recalculated_at', now());
END;
$$;

-- 3) Trigger function: keeps balance in sync on INSERT/UPDATE/DELETE of invoices
CREATE OR REPLACE FUNCTION public.sync_customer_balance_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalc_customer_balance(NEW.customer_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_customer_balance(OLD.customer_id);
  ELSIF TG_OP = 'UPDATE' THEN
    -- recalc both old and new customer if customer changed
    IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
      PERFORM public.recalc_customer_balance(OLD.customer_id);
      PERFORM public.recalc_customer_balance(NEW.customer_id);
    ELSIF OLD.total IS DISTINCT FROM NEW.total
       OR OLD.paid_amount IS DISTINCT FROM NEW.paid_amount THEN
      PERFORM public.recalc_customer_balance(NEW.customer_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- 4) Attach trigger to invoices
DROP TRIGGER IF EXISTS trg_sync_customer_balance ON public.invoices;
CREATE TRIGGER trg_sync_customer_balance
AFTER INSERT OR UPDATE OF total, paid_amount, customer_id OR DELETE
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_balance_from_invoice();

-- 5) Run one-time recalculation NOW to fix existing data
SELECT public.recalc_all_customer_balances();