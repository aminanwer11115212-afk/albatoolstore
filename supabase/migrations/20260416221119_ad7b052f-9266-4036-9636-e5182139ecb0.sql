
-- ============ Batch A: Advanced Packaging & Transport ============

-- 1) invoices_packaging_items: detailed items inside each packaging entry
CREATE TABLE public.invoices_packaging_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_packaging_id UUID NOT NULL REFERENCES public.invoice_packaging(id) ON DELETE CASCADE,
  packaging_type_id UUID REFERENCES public.packaging_types(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ipi_header ON public.invoices_packaging_items(invoice_packaging_id);
CREATE INDEX idx_ipi_type ON public.invoices_packaging_items(packaging_type_id);

-- 2) quotes_packaging: packaging headers for quotes (mirrors invoice_packaging)
CREATE TABLE public.quotes_packaging (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  packaging_type_id UUID REFERENCES public.packaging_types(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  weight NUMERIC(15,3),
  dimensions TEXT,
  cost NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qp_quote ON public.quotes_packaging(quote_id);

-- 3) quotes_packaging_items: detailed items inside each quote packaging
CREATE TABLE public.quotes_packaging_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_packaging_id UUID NOT NULL REFERENCES public.quotes_packaging(id) ON DELETE CASCADE,
  packaging_type_id UUID REFERENCES public.packaging_types(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qpi_header ON public.quotes_packaging_items(quote_packaging_id);

-- 4) quote_transports: transport entries for quotes (mirrors invoice_transports)
CREATE TABLE public.quote_transports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
  transporter_id UUID REFERENCES public.transporters(id) ON DELETE SET NULL,
  driver_name TEXT,
  vehicle_number TEXT,
  transport_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qt_quote ON public.quote_transports(quote_id);
CREATE INDEX idx_qt_customer ON public.quote_transports(customer_id);

-- 5) customer_destinations: M:N customers <-> destinations
CREATE TABLE public.customer_destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, destination_id)
);
CREATE INDEX idx_cd_customer ON public.customer_destinations(customer_id);
CREATE INDEX idx_cd_destination ON public.customer_destinations(destination_id);

-- 6) customer_preferred_transporter: one preferred transporter per customer
CREATE TABLE public.customer_preferred_transporter (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  transporter_id UUID NOT NULL REFERENCES public.transporters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) customer_transporters: M:N customers <-> transporters (multiple preferred)
CREATE TABLE public.customer_transporters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  transporter_id UUID NOT NULL REFERENCES public.transporters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, transporter_id)
);
CREATE INDEX idx_ct_customer ON public.customer_transporters(customer_id);

-- 8) destination_transporters: M:N destinations <-> transporters
CREATE TABLE public.destination_transporters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  destination_id UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  transporter_id UUID NOT NULL REFERENCES public.transporters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(destination_id, transporter_id)
);
CREATE INDEX idx_dt_destination ON public.destination_transporters(destination_id);

-- ============ RLS ============
ALTER TABLE public.invoices_packaging_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes_packaging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes_packaging_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_transports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_preferred_transporter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_transporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destination_transporters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access ipi" ON public.invoices_packaging_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access qp" ON public.quotes_packaging FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access qpi" ON public.quotes_packaging_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access qt" ON public.quote_transports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access cd" ON public.customer_destinations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access cpt" ON public.customer_preferred_transporter FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access ct" ON public.customer_transporters FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access dt" ON public.destination_transporters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger for customer_preferred_transporter
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_cpt_updated
BEFORE UPDATE ON public.customer_preferred_transporter
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
