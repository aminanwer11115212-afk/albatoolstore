ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_workflow_status_check;
UPDATE public.invoices SET workflow_status = 'in_transit' WHERE workflow_status = 'ready';
ALTER TABLE public.invoices ADD CONSTRAINT invoices_workflow_status_check
  CHECK (workflow_status = ANY (ARRAY['quote'::text, 'preparing'::text, 'in_transit'::text, 'done'::text]));