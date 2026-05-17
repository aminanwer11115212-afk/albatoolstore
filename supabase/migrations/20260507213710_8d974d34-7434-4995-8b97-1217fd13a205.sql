
-- Workflow automation settings flag
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS workflow_automation_enabled boolean NOT NULL DEFAULT true;

-- Helper: rank of workflow_status (higher = later stage)
CREATE OR REPLACE FUNCTION public.workflow_rank(_s text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(_s,'new')
    WHEN 'new' THEN 0
    WHEN 'preparing' THEN 1
    WHEN 'in_transit' THEN 2
    WHEN 'done' THEN 3
    ELSE 0
  END
$$;

-- Helper: is automation enabled?
CREATE OR REPLACE FUNCTION public.is_workflow_automation_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT workflow_automation_enabled FROM public.company_settings LIMIT 1), true)
$$;

-- Helper: advance an invoice's workflow_status to target only if target is later
CREATE OR REPLACE FUNCTION public.advance_invoice_workflow(_invoice_id uuid, _target text, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
  v_total numeric;
  v_items int;
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;
  IF NOT public.is_workflow_automation_enabled() THEN RETURN; END IF;

  SELECT workflow_status, total INTO v_current, v_total
  FROM public.invoices WHERE id = _invoice_id;
  IF v_current IS NULL THEN RETURN; END IF;

  -- Only advance forward (never downgrade auto)
  IF public.workflow_rank(_target) <= public.workflow_rank(v_current) THEN
    RETURN;
  END IF;

  -- Don't promote past preparing on an empty invoice
  IF _target IN ('in_transit','done') THEN
    SELECT COUNT(*) INTO v_items FROM public.invoice_items WHERE invoice_id = _invoice_id;
    IF v_items = 0 OR COALESCE(v_total,0) <= 0 THEN
      RETURN;
    END IF;
  END IF;

  UPDATE public.invoices
  SET workflow_status = _target,
      updated_at = now()
  WHERE id = _invoice_id;

  INSERT INTO public.invoice_revisions (invoice_id, action, note, changed_by, changes)
  VALUES (
    _invoice_id,
    'auto_workflow',
    _reason,
    'system',
    jsonb_build_object('from', v_current, 'to', _target, 'auto', true, 'reason', _reason)
  );
END;
$$;

-- Trigger 1: first invoice_item insert → preparing
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'preparing', 'إضافة بند للفاتورة');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_workflow_on_item ON public.invoice_items;
CREATE TRIGGER auto_workflow_on_item
AFTER INSERT ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_item();

-- Trigger 2: invoice_transports insert → in_transit
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_transport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'in_transit', 'تسجيل ترحيل للفاتورة');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_workflow_on_transport ON public.invoice_transports;
CREATE TRIGGER auto_workflow_on_transport
AFTER INSERT ON public.invoice_transports
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_transport();

-- Trigger 3: invoice_packaging insert → preparing (in case items added via packaging flow)
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_packaging()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'preparing', 'بدء تغليف الفاتورة');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_workflow_on_packaging ON public.invoice_packaging;
CREATE TRIGGER auto_workflow_on_packaging
AFTER INSERT ON public.invoice_packaging
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_packaging();

-- Trigger 4: paid_amount >= total → done (on invoices update)
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workflow_automation_enabled() THEN RETURN NEW; END IF;
  IF COALESCE(NEW.total,0) > 0
     AND COALESCE(NEW.paid_amount,0) >= COALESCE(NEW.total,0) - 0.01
     AND public.workflow_rank(NEW.workflow_status) < public.workflow_rank('done')
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.paid_amount,0) <> COALESCE(NEW.paid_amount,0))
  THEN
    NEW.workflow_status := 'done';
    INSERT INTO public.invoice_revisions (invoice_id, action, note, changed_by, changes)
    VALUES (
      NEW.id,
      'auto_workflow',
      'سداد كامل للفاتورة',
      'system',
      jsonb_build_object('from', COALESCE(OLD.workflow_status, NEW.workflow_status), 'to', 'done', 'auto', true, 'reason', 'سداد كامل')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_workflow_on_payment ON public.invoices;
CREATE TRIGGER auto_workflow_on_payment
BEFORE UPDATE OF paid_amount, total ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_payment();
