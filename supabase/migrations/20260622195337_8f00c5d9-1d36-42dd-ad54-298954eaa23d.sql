
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'regular';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS walk_in_customer_name text;
CREATE INDEX IF NOT EXISTS invoices_source_idx ON public.invoices(source);
