ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS allocation jsonb;