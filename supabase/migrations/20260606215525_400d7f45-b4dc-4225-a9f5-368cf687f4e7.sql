
-- ============ M2M product links ============
CREATE TABLE IF NOT EXISTS public.product_category_links (
  product_id uuid NOT NULL,
  category_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_category_links TO authenticated, anon;
GRANT ALL ON public.product_category_links TO service_role;
ALTER TABLE public.product_category_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_product_category_links ON public.product_category_links FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.product_brand_links (
  product_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_brand_links TO authenticated, anon;
GRANT ALL ON public.product_brand_links TO service_role;
ALTER TABLE public.product_brand_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_product_brand_links ON public.product_brand_links FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ Invoice packaging/transport ============
CREATE TABLE IF NOT EXISTS public.invoice_packaging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  packaging_type_id uuid,
  notes text,
  total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_packaging TO authenticated, anon;
GRANT ALL ON public.invoice_packaging TO service_role;
ALTER TABLE public.invoice_packaging ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_invoice_packaging ON public.invoice_packaging FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.invoices_packaging_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  packaging_id uuid,
  packaging_type_id uuid,
  description text,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices_packaging_items TO authenticated, anon;
GRANT ALL ON public.invoices_packaging_items TO service_role;
ALTER TABLE public.invoices_packaging_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_invoices_packaging_items ON public.invoices_packaging_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.invoice_transports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  transporter_id uuid,
  destination_id uuid,
  driver_name text,
  vehicle_number text,
  cost numeric DEFAULT 0,
  status text DEFAULT 'pending',
  notes text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_transports TO authenticated, anon;
GRANT ALL ON public.invoice_transports TO service_role;
ALTER TABLE public.invoice_transports ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_invoice_transports ON public.invoice_transports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ Quote packaging/transport ============
CREATE TABLE IF NOT EXISTS public.quotes_packaging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  packaging_type_id uuid,
  notes text,
  total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes_packaging TO authenticated, anon;
GRANT ALL ON public.quotes_packaging TO service_role;
ALTER TABLE public.quotes_packaging ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_quotes_packaging ON public.quotes_packaging FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.quotes_packaging_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  packaging_id uuid,
  packaging_type_id uuid,
  description text,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes_packaging_items TO authenticated, anon;
GRANT ALL ON public.quotes_packaging_items TO service_role;
ALTER TABLE public.quotes_packaging_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_quotes_packaging_items ON public.quotes_packaging_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.quote_transports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  transporter_id uuid,
  destination_id uuid,
  driver_name text,
  vehicle_number text,
  cost numeric DEFAULT 0,
  status text DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_transports TO authenticated, anon;
GRANT ALL ON public.quote_transports TO service_role;
ALTER TABLE public.quote_transports ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_quote_transports ON public.quote_transports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ Customer / destination links ============
CREATE TABLE IF NOT EXISTS public.customer_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_destinations TO authenticated, anon;
GRANT ALL ON public.customer_destinations TO service_role;
ALTER TABLE public.customer_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_customer_destinations ON public.customer_destinations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.customer_preferred_transporter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE,
  transporter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_preferred_transporter TO authenticated, anon;
GRANT ALL ON public.customer_preferred_transporter TO service_role;
ALTER TABLE public.customer_preferred_transporter ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_customer_preferred_transporter ON public.customer_preferred_transporter FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.customer_transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  transporter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, transporter_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_transporters TO authenticated, anon;
GRANT ALL ON public.customer_transporters TO service_role;
ALTER TABLE public.customer_transporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_customer_transporters ON public.customer_transporters FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.destination_transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL,
  transporter_id uuid NOT NULL,
  cost numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(destination_id, transporter_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destination_transporters TO authenticated, anon;
GRANT ALL ON public.destination_transporters TO service_role;
ALTER TABLE public.destination_transporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_destination_transporters ON public.destination_transporters FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ Audit / activity / trash ============
CREATE TABLE IF NOT EXISTS public.invoice_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  revision_number integer DEFAULT 1,
  snapshot jsonb,
  changed_by text,
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_revisions TO authenticated, anon;
GRANT ALL ON public.invoice_revisions TO service_role;
ALTER TABLE public.invoice_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_invoice_revisions ON public.invoice_revisions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  user_email text,
  user_name text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated, anon;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_activity_log ON public.activity_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.deleted_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by text,
  reason text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_invoice_items TO authenticated, anon;
GRANT ALL ON public.deleted_invoice_items TO service_role;
ALTER TABLE public.deleted_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_deleted_invoice_items ON public.deleted_invoice_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.deleted_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by text,
  reason text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_quote_items TO authenticated, anon;
GRANT ALL ON public.deleted_quote_items TO service_role;
ALTER TABLE public.deleted_quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_deleted_quote_items ON public.deleted_quote_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ Currencies & exchange rates ============
CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  symbol text,
  is_base boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies TO authenticated, anon;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_currencies ON public.currencies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated, anon;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY all_exchange_rates ON public.exchange_rates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============ Triggers for updated_at ============
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['invoice_packaging','invoice_transports','quotes_packaging','quote_transports','currencies'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ============ Seed default currencies ============
INSERT INTO public.currencies (code, name, symbol, is_base)
VALUES ('SDG','جنيه سوداني','ج.س',true),('USD','دولار أمريكي','$',false),('SAR','ريال سعودي','﷼',false),('AED','درهم إماراتي','د.إ',false),('EUR','يورو','€',false)
ON CONFLICT (code) DO NOTHING;
