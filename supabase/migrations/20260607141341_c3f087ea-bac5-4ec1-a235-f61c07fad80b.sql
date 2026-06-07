-- Batch 2: staff permissions, bank account metadata, and visible creator fields

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS iban text;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS employee_id uuid,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS login_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS created_by text;

CREATE INDEX IF NOT EXISTS idx_user_roles_employee_id ON public.user_roles(employee_id);

NOTIFY pgrst, 'reload schema';