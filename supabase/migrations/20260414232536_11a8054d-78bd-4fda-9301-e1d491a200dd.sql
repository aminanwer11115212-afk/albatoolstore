
-- Add missing columns to destinations table (from old system)
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS country text DEFAULT 'السودان';
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS contact_person text;
