
-- 1) Kill switch column
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS workflow_automation_enabled boolean NOT NULL DEFAULT true;

-- 2) Missing guard function used by advance_invoice_workflow
CREATE OR REPLACE FUNCTION public.is_workflow_automation_enabled()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT workflow_automation_enabled FROM public.company_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1),
    true
  );
$$;

-- 3) Triggers ----------------------------------------------------------------

-- 3a) Invoice items inserted → preparing
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'preparing', 'إضافة بنود للفاتورة');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS auto_workflow_on_item ON public.invoice_items;
CREATE TRIGGER auto_workflow_on_item
AFTER INSERT ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_item();

-- 3b) Packaging row inserted → preparing
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_packaging()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'preparing', 'إضافة سجل تغليف');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS auto_workflow_on_packaging ON public.invoice_packaging;
CREATE TRIGGER auto_workflow_on_packaging
AFTER INSERT ON public.invoice_packaging
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_packaging();

-- 3c) Transport row inserted → in_transit
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_transport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'in_transit', 'إضافة سجل ترحيل');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS auto_workflow_on_transport ON public.invoice_transports;
CREATE TRIGGER auto_workflow_on_transport
AFTER INSERT ON public.invoice_transports
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_transport();

-- 3d) Payment completed → done
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.total,0) > 0
     AND COALESCE(NEW.paid_amount,0) >= COALESCE(NEW.total,0) - 0.01
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.paid_amount,0) < COALESCE(OLD.total,0) - 0.01)
  THEN
    PERFORM public.advance_invoke_safe(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

-- helper (inline) to keep the trigger small
CREATE OR REPLACE FUNCTION public.advance_invoke_safe(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.advance_invoice_workflow(_id, 'done', 'اكتمال الدفع');
$$;

DROP TRIGGER IF EXISTS auto_workflow_on_payment ON public.invoices;
CREATE TRIGGER auto_workflow_on_payment
AFTER INSERT OR UPDATE OF paid_amount, total ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_payment();

-- 4) Fix corrupt state: empty invoice should not be ready_to_ship
UPDATE public.invoices
SET workflow_status = 'new', updated_at = now()
WHERE workflow_status IN ('ready_to_ship','in_transit','done')
  AND (COALESCE(total,0) <= 0
       OR NOT EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.invoice_id = invoices.id));
