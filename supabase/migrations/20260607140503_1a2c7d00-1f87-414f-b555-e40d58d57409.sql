ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS rate_to_base numeric,
  ADD COLUMN IF NOT EXISTS notes text;

NOTIFY pgrst, 'reload schema';