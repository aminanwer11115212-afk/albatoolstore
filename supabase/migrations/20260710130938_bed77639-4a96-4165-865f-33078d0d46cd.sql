-- Update supplier balance to net out supplier payments not linked to a specific purchase order
CREATE OR REPLACE FUNCTION public.recompute_supplier_balance(_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open numeric;
  v_unlinked_payments numeric;
BEGIN
  IF _supplier_id IS NULL THEN RETURN; END IF;

  -- Remaining on non-cancelled purchase orders (already subtracts paid_amount tracked on PO)
  SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)), 0)
    INTO v_open
    FROM public.purchase_orders
   WHERE supplier_id = _supplier_id
     AND COALESCE(status,'') <> 'cancelled';

  -- General supplier payments not tied to a specific PO (advance / balance credit)
  SELECT COALESCE(SUM(COALESCE(amount,0)), 0)
    INTO v_unlinked_payments
    FROM public.transactions
   WHERE supplier_id = _supplier_id
     AND category = 'supplier_payment'
     AND reference_id IS NULL;

  UPDATE public.suppliers
     SET balance = GREATEST(v_open - v_unlinked_payments, 0),
         updated_at = now()
   WHERE id = _supplier_id;
END;
$function$;

-- Trigger: recompute supplier balance whenever a supplier_payment transaction changes
CREATE OR REPLACE FUNCTION public.trg_tx_recompute_supp_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.supplier_id IS NOT NULL AND OLD.category = 'supplier_payment' THEN
      PERFORM public.recompute_supplier_balance(OLD.supplier_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.supplier_id IS NOT NULL AND NEW.category = 'supplier_payment' THEN
    PERFORM public.recompute_supplier_balance(NEW.supplier_id);
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.supplier_id IS DISTINCT FROM NEW.supplier_id
     AND OLD.supplier_id IS NOT NULL
     AND OLD.category = 'supplier_payment' THEN
    PERFORM public.recompute_supplier_balance(OLD.supplier_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tx_recompute_supp_balance ON public.transactions;
CREATE TRIGGER trg_tx_recompute_supp_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_tx_recompute_supp_balance();

-- One-time recompute for all suppliers so existing data is consistent
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.suppliers LOOP
    PERFORM public.recompute_supplier_balance(r.id);
  END LOOP;
END $$;