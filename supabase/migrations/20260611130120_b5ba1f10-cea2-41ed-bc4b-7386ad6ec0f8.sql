
-- إعادة احتساب رصيد حساب واحد
CREATE OR REPLACE FUNCTION public.recompute_account_balance(_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_balance numeric;
BEGIN
  IF _account_id IS NULL THEN RETURN; END IF;
  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'income'   AND account_id    = _account_id THEN COALESCE(amount,0)
        WHEN type = 'expense'  AND account_id    = _account_id THEN -COALESCE(amount,0)
        WHEN type = 'transfer' AND to_account_id = _account_id THEN COALESCE(amount,0)
        WHEN type = 'transfer' AND account_id    = _account_id THEN -COALESCE(amount,0)
        ELSE 0
      END
    ), 0)
  INTO v_balance
  FROM public.transactions
  WHERE account_id = _account_id OR to_account_id = _account_id;

  UPDATE public.accounts SET balance = v_balance, updated_at = now() WHERE id = _account_id;
END;
$$;

-- Trigger function: يعيد حساب الحسابات المتأثرة بحركة
CREATE OR REPLACE FUNCTION public.trg_tx_recompute_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL    THEN PERFORM public.recompute_account_balance(OLD.account_id); END IF;
    IF OLD.to_account_id IS NOT NULL THEN PERFORM public.recompute_account_balance(OLD.to_account_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.account_id IS NOT NULL    THEN PERFORM public.recompute_account_balance(NEW.account_id); END IF;
  IF NEW.to_account_id IS NOT NULL THEN PERFORM public.recompute_account_balance(NEW.to_account_id); END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.account_id IS NOT NULL    AND OLD.account_id    IS DISTINCT FROM NEW.account_id    THEN PERFORM public.recompute_account_balance(OLD.account_id); END IF;
    IF OLD.to_account_id IS NOT NULL AND OLD.to_account_id IS DISTINCT FROM NEW.to_account_id THEN PERFORM public.recompute_account_balance(OLD.to_account_id); END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tx_recompute_account_balance ON public.transactions;
CREATE TRIGGER tx_recompute_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_tx_recompute_account_balance();

-- إعادة احتساب أرصدة جميع الحسابات الحالية مرة واحدة
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.accounts LOOP
    PERFORM public.recompute_account_balance(r.id);
  END LOOP;
END $$;
