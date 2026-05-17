ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_workflow_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_workflow_status_check
  CHECK (workflow_status = ANY (ARRAY['quote'::text, 'new'::text, 'preparing'::text, 'ready_to_ship'::text, 'in_transit'::text, 'done'::text]));