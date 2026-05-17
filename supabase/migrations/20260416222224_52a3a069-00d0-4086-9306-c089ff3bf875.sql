
-- ============ Batch D: Multi-Currency + Exchange Rates ============

CREATE TABLE IF NOT EXISTS public.currencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  symbol TEXT,
  is_base BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  decimal_places INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access currencies" ON public.currencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_code TEXT NOT NULL,
  rate_to_base NUMERIC NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON public.exchange_rates(currency_code);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON public.exchange_rates(effective_date DESC);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth full access exchange_rates" ON public.exchange_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed common currencies
INSERT INTO public.currencies (code, name, symbol, is_base, is_active, decimal_places) VALUES
  ('SDG', 'الجنيه السوداني', 'ج.س', true, true, 2),
  ('USD', 'الدولار الأمريكي', '$', false, true, 2),
  ('EUR', 'اليورو', '€', false, true, 2),
  ('SAR', 'الريال السعودي', 'ر.س', false, true, 2),
  ('AED', 'الدرهم الإماراتي', 'د.إ', false, true, 2),
  ('EGP', 'الجنيه المصري', 'ج.م', false, true, 2)
ON CONFLICT (code) DO NOTHING;
