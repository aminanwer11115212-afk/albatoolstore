
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS shipping numeric DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS debit numeric DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS credit numeric DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_id text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.transporters ADD COLUMN IF NOT EXISTS address text;
