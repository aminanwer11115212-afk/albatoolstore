
CREATE OR REPLACE FUNCTION public.recompute_customer_balance(_customer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric; v_credit numeric;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)), 0)
    INTO v_balance FROM public.invoices
    WHERE customer_id = _customer_id AND COALESCE(status,'') <> 'cancelled';
  SELECT COALESCE(SUM(COALESCE(amount,0)), 0) INTO v_credit
    FROM public.transactions
    WHERE customer_id = _customer_id AND category = 'customer_credit';
  UPDATE public.customers
    SET balance = v_balance, credit_balance = v_credit, updated_at = now()
    WHERE id = _customer_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_invoices_recompute_cust_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_customer_balance(OLD.customer_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_customer_balance(NEW.customer_id);
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recompute_customer_balance(OLD.customer_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_tx_recompute_cust_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_balance(OLD.customer_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.customer_id IS NOT NULL THEN
    PERFORM public.recompute_customer_balance(NEW.customer_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id AND OLD.customer_id IS NOT NULL THEN
    PERFORM public.recompute_customer_balance(OLD.customer_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS invoices_recompute_customer_balance ON public.invoices;
CREATE TRIGGER invoices_recompute_customer_balance
AFTER INSERT OR UPDATE OF total, paid_amount, status, customer_id OR DELETE
ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_recompute_cust_balance();

DROP TRIGGER IF EXISTS transactions_recompute_customer_balance ON public.transactions;
CREATE TRIGGER transactions_recompute_customer_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_tx_recompute_cust_balance();

CREATE OR REPLACE FUNCTION public.recompute_supplier_balance(_supplier_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric;
BEGIN
  IF _supplier_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)), 0)
    INTO v_balance FROM public.purchase_orders
    WHERE supplier_id = _supplier_id AND COALESCE(status,'') <> 'cancelled';
  UPDATE public.suppliers SET balance = v_balance, updated_at = now() WHERE id = _supplier_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_po_recompute_supp_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_supplier_balance(OLD.supplier_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_supplier_balance(NEW.supplier_id);
  IF TG_OP = 'UPDATE' AND OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN
    PERFORM public.recompute_supplier_balance(OLD.supplier_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS po_recompute_supplier_balance ON public.purchase_orders;
CREATE TRIGGER po_recompute_supplier_balance
AFTER INSERT OR UPDATE OF total, paid_amount, status, supplier_id OR DELETE
ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.trg_po_recompute_supp_balance();

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.invoices
    SET status = 'overdue', updated_at = now()
    WHERE status IN ('pending','partial')
      AND due_date IS NOT NULL AND due_date < CURRENT_DATE
      AND COALESCE(total,0) - COALESCE(paid_amount,0) > 0.01;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.recompute_customer_balance(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_supplier_balance(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices() TO authenticated, anon, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.customers LOOP
    PERFORM public.recompute_customer_balance(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.suppliers LOOP
    PERFORM public.recompute_supplier_balance(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
