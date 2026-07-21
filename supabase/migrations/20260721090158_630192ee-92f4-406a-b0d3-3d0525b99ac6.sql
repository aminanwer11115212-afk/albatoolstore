DROP FUNCTION IF EXISTS public.advance_invoice_workflow(uuid, text, text);

CREATE OR REPLACE FUNCTION public.advance_invoice_workflow(_invoice_id uuid, _target text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current text;
  v_total numeric;
  v_items int;
BEGIN
  IF _invoice_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_invoice_id');
  END IF;
  IF NOT public.is_workflow_automation_enabled() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'automation_disabled');
  END IF;

  SELECT workflow_status, total INTO v_current, v_total
  FROM public.invoices WHERE id = _invoice_id;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  END IF;

  IF public.workflow_rank(_target) <= public.workflow_rank(v_current) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_upgrade', 'from', v_current, 'to', _target);
  END IF;

  IF _target IN ('ready_to_ship','in_transit','done') THEN
    SELECT COUNT(*) INTO v_items FROM public.invoice_items WHERE invoice_id = _invoice_id;
    IF v_items = 0 OR COALESCE(v_total,0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'empty_invoice');
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

  RETURN jsonb_build_object('ok', true, 'from', v_current, 'to', _target);
END;
$function$;