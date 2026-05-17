ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'preparing';

ALTER TABLE public.invoices
ADD CONSTRAINT invoices_workflow_status_check
CHECK (workflow_status IN ('preparing', 'ready', 'in_transit', 'done'));

CREATE INDEX IF NOT EXISTS idx_invoices_workflow_status ON public.invoices(workflow_status);