-- Batch 1: missing columns and logical compatibility across pages

-- Currency settings and exchange-rate compatibility
ALTER TABLE public.currencies
  ADD COLUMN IF NOT EXISTS decimal_places integer DEFAULT 2;

ALTER TABLE public.exchange_rates
  ALTER COLUMN from_currency DROP NOT NULL,
  ALTER COLUMN to_currency DROP NOT NULL,
  ALTER COLUMN rate DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_exchange_rate_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base text;
BEGIN
  SELECT code INTO v_base
  FROM public.currencies
  WHERE is_base = true
  ORDER BY created_at DESC
  LIMIT 1;

  v_base := COALESCE(v_base, 'SDG');

  NEW.currency_code := COALESCE(NULLIF(NEW.currency_code, ''), NULLIF(NEW.from_currency, ''), 'USD');
  NEW.rate_to_base := COALESCE(NEW.rate_to_base, NEW.rate, 1);
  NEW.from_currency := COALESCE(NULLIF(NEW.from_currency, ''), NEW.currency_code);
  NEW.to_currency := COALESCE(NULLIF(NEW.to_currency, ''), v_base);
  NEW.rate := COALESCE(NEW.rate, NEW.rate_to_base, 1);
  NEW.effective_date := COALESCE(NEW.effective_date, CURRENT_DATE);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_exchange_rate_columns ON public.exchange_rates;
CREATE TRIGGER trg_sync_exchange_rate_columns
BEFORE INSERT OR UPDATE ON public.exchange_rates
FOR EACH ROW EXECUTE FUNCTION public.sync_exchange_rate_columns();

UPDATE public.exchange_rates
SET
  currency_code = COALESCE(currency_code, from_currency, 'USD'),
  rate_to_base = COALESCE(rate_to_base, rate, 1),
  from_currency = COALESCE(from_currency, currency_code, 'USD'),
  to_currency = COALESCE(to_currency, (SELECT code FROM public.currencies WHERE is_base = true ORDER BY created_at DESC LIMIT 1), 'SDG'),
  rate = COALESCE(rate, rate_to_base, 1);

-- Main document columns used by create/view/report pages
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS internal_note text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS internal_note text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS internal_note text,
  ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric DEFAULT 1;

-- Transport columns used by invoice/quote transport pages and print extras
ALTER TABLE public.invoice_transports
  ADD COLUMN IF NOT EXISTS transport_date date DEFAULT CURRENT_DATE;

ALTER TABLE public.quote_transports
  ADD COLUMN IF NOT EXISTS transport_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Packaging headers used by invoice/quote packaging pages and print extras
ALTER TABLE public.invoice_packaging
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packs_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pieces_per_pack integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0;

ALTER TABLE public.quotes_packaging
  ADD COLUMN IF NOT EXISTS quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packs_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pieces_per_pack integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0;

-- Packaging item rows used by the nested managers
ALTER TABLE public.invoices_packaging_items
  ADD COLUMN IF NOT EXISTS invoice_packaging_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS packs_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pieces_per_pack integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;

UPDATE public.invoices_packaging_items
SET invoice_packaging_id = COALESCE(invoice_packaging_id, packaging_id)
WHERE invoice_packaging_id IS NULL AND packaging_id IS NOT NULL;

ALTER TABLE public.quotes_packaging_items
  ADD COLUMN IF NOT EXISTS quote_packaging_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS packs_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pieces_per_pack integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;

UPDATE public.quotes_packaging_items
SET quote_packaging_id = COALESCE(quote_packaging_id, packaging_id)
WHERE quote_packaging_id IS NULL AND packaging_id IS NOT NULL;

-- Transport item rows used by invoice transport details
CREATE TABLE IF NOT EXISTS public.invoices_transports_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_transport_id uuid,
  product_id uuid,
  product_name text,
  packs_count integer DEFAULT 1,
  pieces_per_pack integer DEFAULT 1,
  quantity numeric DEFAULT 0,
  price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices_transports_items TO anon, authenticated;
GRANT ALL ON public.invoices_transports_items TO service_role;
ALTER TABLE public.invoices_transports_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS all_invoices_transports_items ON public.invoices_transports_items;
CREATE POLICY all_invoices_transports_items ON public.invoices_transports_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Optional locality-to-transporter linking used by transport filtering
CREATE TABLE IF NOT EXISTS public.locality_transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locality_id uuid NOT NULL,
  transporter_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (locality_id, transporter_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locality_transporters TO anon, authenticated;
GRANT ALL ON public.locality_transporters TO service_role;
ALTER TABLE public.locality_transporters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS all_locality_transporters ON public.locality_transporters;
CREATE POLICY all_locality_transporters ON public.locality_transporters FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Attachment tables used by invoice, quote, and purchase attachment dialogs
CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size numeric,
  category text NOT NULL DEFAULT 'details',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  deleted_at timestamp with time zone,
  deleted_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_attachments TO anon, authenticated;
GRANT ALL ON public.invoice_attachments TO service_role;
ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS all_invoice_attachments ON public.invoice_attachments;
CREATE POLICY all_invoice_attachments ON public.invoice_attachments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.quote_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size numeric,
  category text NOT NULL DEFAULT 'details',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  deleted_at timestamp with time zone,
  deleted_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_attachments TO anon, authenticated;
GRANT ALL ON public.quote_attachments TO service_role;
ALTER TABLE public.quote_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS all_quote_attachments ON public.quote_attachments;
CREATE POLICY all_quote_attachments ON public.quote_attachments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.purchase_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size numeric,
  category text NOT NULL DEFAULT 'details',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  deleted_at timestamp with time zone,
  deleted_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_attachments TO anon, authenticated;
GRANT ALL ON public.purchase_attachments TO service_role;
ALTER TABLE public.purchase_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS all_purchase_attachments ON public.purchase_attachments;
CREATE POLICY all_purchase_attachments ON public.purchase_attachments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- User UI preferences synced from localStorage for column widths and layout settings
CREATE TABLE IF NOT EXISTS public.user_ui_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ui_preferences TO authenticated;
GRANT ALL ON public.user_ui_preferences TO service_role;
ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_manage_own_ui_preferences ON public.user_ui_preferences;
CREATE POLICY users_manage_own_ui_preferences ON public.user_ui_preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Data-health pages and scanner results
CREATE TABLE IF NOT EXISTS public.data_anomaly_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  triggered_by text NOT NULL DEFAULT 'manual',
  rules_run integer DEFAULT 0,
  anomalies_found integer DEFAULT 0,
  anomalies_new integer DEFAULT 0,
  anomalies_resolved integer DEFAULT 0,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running',
  error_message text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_anomaly_runs TO anon, authenticated;
GRANT ALL ON public.data_anomaly_runs TO service_role;
ALTER TABLE public.data_anomaly_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS all_data_anomaly_runs ON public.data_anomaly_runs;
CREATE POLICY all_data_anomaly_runs ON public.data_anomaly_runs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.data_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid,
  category text NOT NULL DEFAULT 'data',
  severity text NOT NULL DEFAULT 'warning',
  rule_code text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  record_label text,
  description text NOT NULL,
  observed_value jsonb,
  status text NOT NULL DEFAULT 'open',
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  ignored_at timestamp with time zone,
  ignored_reason text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_anomalies TO anon, authenticated;
GRANT ALL ON public.data_anomalies TO service_role;
ALTER TABLE public.data_anomalies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS all_data_anomalies ON public.data_anomalies;
CREATE POLICY all_data_anomalies ON public.data_anomalies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_date ON public.exchange_rates(currency_code, effective_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_transports_items_parent ON public.invoices_transports_items(invoice_transport_id);
CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice ON public.invoice_attachments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote ON public.quote_attachments(quote_id);
CREATE INDEX IF NOT EXISTS idx_purchase_attachments_order ON public.purchase_attachments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_data_anomalies_status ON public.data_anomalies(status, severity, last_seen_at DESC);

NOTIFY pgrst, 'reload schema';