-- Fix workflow_rank to include ready_to_ship and reorder
CREATE OR REPLACE FUNCTION public.workflow_rank(_s text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(_s,'new')
    WHEN 'new' THEN 0
    WHEN 'preparing' THEN 1
    WHEN 'ready_to_ship' THEN 2
    WHEN 'in_transit' THEN 3
    WHEN 'done' THEN 4
    ELSE 0
  END
$$;

-- Update advance_invoice_workflow: empty-invoice guard now also blocks ready_to_ship
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

  IF public.workflow_rank(_target) <= public.workflow_rank(v_current) THEN
    RETURN;
  END IF;

  IF _target IN ('ready_to_ship','in_transit','done') THEN
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