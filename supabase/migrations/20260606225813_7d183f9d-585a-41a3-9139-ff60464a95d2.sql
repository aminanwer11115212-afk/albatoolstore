-- 1) Drop the DB-side stock deduction trigger/function to avoid double-deduction.
--    Client uses invoices.stock_deduction_id as the single source of truth.
DROP TRIGGER IF EXISTS invoices_workflow_stock_deduction ON public.invoices;
DROP FUNCTION IF EXISTS public.invoices_workflow_stock_deduction_fn();

-- 2) Add stock deduction guard columns to invoices (used by deductStockForInvoiceOnce)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stock_deduction_id uuid,
  ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz;

-- 3) Add missing columns to invoice_revisions (used by recordInvoiceRevision + WorkflowStatusBadge)
ALTER TABLE public.invoice_revisions
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS changes jsonb,
  ADD COLUMN IF NOT EXISTS note text;

-- Helpful index for the badge query (.in invoice_id ... .eq action 'auto_workflow' .order created_at desc)
CREATE INDEX IF NOT EXISTS idx_invoice_revisions_invoice_action_created
  ON public.invoice_revisions (invoice_id, action, created_at DESC);