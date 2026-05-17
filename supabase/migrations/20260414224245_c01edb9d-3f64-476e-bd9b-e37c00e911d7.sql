
-- Invoice transport records
CREATE TABLE public.invoice_transports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  transporter_id UUID REFERENCES public.transporters(id),
  destination_id UUID REFERENCES public.destinations(id),
  transport_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vehicle_number TEXT,
  driver_name TEXT,
  notes TEXT,
  cost NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Invoice packaging records
CREATE TABLE public.invoice_packaging (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  packaging_type_id UUID REFERENCES public.packaging_types(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  weight NUMERIC,
  dimensions TEXT,
  notes TEXT,
  cost NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.invoice_transports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_packaging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access invoice_transports" ON public.invoice_transports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access invoice_packaging" ON public.invoice_packaging FOR ALL TO authenticated USING (true) WITH CHECK (true);
