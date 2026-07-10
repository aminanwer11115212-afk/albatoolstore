-- Auto-recompute invoice.status based on paid_amount vs total whenever they change.
-- Keeps DB consistent even if a client bypasses computeInvoiceStatusAfterPayment.
CREATE OR REPLACE FUNCTION public.trg_invoice_recompute_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total  numeric := COALESCE(NEW.total, 0);
  v_paid   numeric := COALESCE(NEW.paid_amount, 0);
  v_status text    := COALESCE(NEW.status, 'pending');
BEGIN
  -- Never override a manual cancel.
  IF v_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF v_total > 0 AND v_paid >= v_total - 0.01 THEN
    NEW.status := 'paid';
  ELSIF v_paid > 0.01 THEN
    NEW.status := 'partial';
  ELSIF NEW.due_date IS NOT NULL
        AND NEW.due_date < CURRENT_DATE
        AND (v_total - v_paid) > 0.01 THEN
    NEW.status := 'overdue';
  ELSE
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_recompute_status ON public.invoices;
CREATE TRIGGER trg_invoice_recompute_status
BEFORE INSERT OR UPDATE OF paid_amount, total, due_date ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoice_recompute_status();

-- One-off backfill: any invoice whose status disagrees with its paid_amount is fixed once.
UPDATE public.invoices
SET updated_at = now()
WHERE COALESCE(status,'') <> 'cancelled'
  AND (
    (COALESCE(total,0) > 0 AND COALESCE(paid_amount,0) >= COALESCE(total,0) - 0.01 AND status <> 'paid')
    OR (COALESCE(paid_amount,0) > 0.01 AND COALESCE(paid_amount,0) < COALESCE(total,0) - 0.01 AND status NOT IN ('partial','overdue'))
    OR (COALESCE(paid_amount,0) <= 0.01 AND status = 'partial')
  );