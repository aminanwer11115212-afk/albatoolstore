
-- Remove auto-advance to "done" when invoice is fully paid.
-- Financial status still becomes 'paid' via trg_invoice_recompute_status;
-- workflow_status stays where the user (or packaging/transport/attachment triggers) placed it.
DROP TRIGGER IF EXISTS auto_workflow_on_payment ON public.invoices;
