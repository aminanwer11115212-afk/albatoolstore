ALTER TABLE public.invoices DROP COLUMN IF EXISTS recurring_template_id;
DROP TABLE IF EXISTS public.recurring_invoice_template_items CASCADE;
DROP TABLE IF EXISTS public.recurring_invoice_templates CASCADE;