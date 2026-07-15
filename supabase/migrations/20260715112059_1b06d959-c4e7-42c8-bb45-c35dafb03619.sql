ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS credit_consumption_order text NOT NULL DEFAULT 'fifo';

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_credit_consumption_order_check;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_credit_consumption_order_check
  CHECK (credit_consumption_order IN ('fifo','lifo'));