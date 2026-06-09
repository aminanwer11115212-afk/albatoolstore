-- Template: a new automation trigger that advances workflow_status via the central RPC.
-- Replace <table>, <fk_column>, <target_status>, <reason_ar>.
--
-- The RPC handles: rank guard, empty-invoice guard, automation kill switch,
-- and logging into invoice_revisions. Never bypass it.

CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_<event>()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.advance_invoice_workflow(
    NEW.<fk_column>,        -- e.g. NEW.invoice_id
    '<target_status>',       -- one of: preparing | ready_to_ship | in_transit | done
    '<reason_ar>'            -- Arabic reason shown in the ⚡ tooltip
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_workflow_on_<event> ON public.<table>;
CREATE TRIGGER auto_workflow_on_<event>
AFTER INSERT ON public.<table>
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_<event>();
