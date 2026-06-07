-- Final quick batch from the automatic missing-column scan

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_balance numeric DEFAULT 0;

ALTER TABLE public.regions
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS record_id uuid,
  ADD COLUMN IF NOT EXISTS changed_by text,
  ADD COLUMN IF NOT EXISTS old_data jsonb,
  ADD COLUMN IF NOT EXISTS new_data jsonb,
  ADD COLUMN IF NOT EXISTS changed_fields text[] DEFAULT '{}';

UPDATE public.activity_log
SET
  table_name = COALESCE(table_name, entity_type),
  record_id = COALESCE(record_id, entity_id),
  changed_by = COALESCE(changed_by, user_name, user_email),
  new_data = COALESCE(new_data, details)
WHERE table_name IS NULL OR record_id IS NULL OR changed_by IS NULL OR new_data IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_table_record ON public.activity_log(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regions_sort_order ON public.regions(sort_order, name);

NOTIFY pgrst, 'reload schema';