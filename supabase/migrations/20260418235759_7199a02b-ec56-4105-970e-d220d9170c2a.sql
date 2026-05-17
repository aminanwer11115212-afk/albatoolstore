
-- Recurring invoice templates
CREATE TABLE public.recurring_invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly', -- daily, weekly, monthly, yearly
  interval_count INTEGER NOT NULL DEFAULT 1, -- e.g. every 2 weeks
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  next_run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_run_date DATE,
  occurrences_generated INTEGER NOT NULL DEFAULT 0,
  max_occurrences INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_send BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  internal_note TEXT,
  tax_status TEXT DEFAULT 'default',
  currency_code TEXT DEFAULT 'SDG',
  discount NUMERIC DEFAULT 0,
  shipping NUMERIC DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access rit" ON public.recurring_invoice_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_rit_updated_at
  BEFORE UPDATE ON public.recurring_invoice_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Items for the template
CREATE TABLE public.recurring_invoice_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.recurring_invoice_templates(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  discount NUMERIC DEFAULT 0,
  discount_value NUMERIC DEFAULT 0,
  format_discount TEXT DEFAULT 'percent',
  tax_rate NUMERIC DEFAULT 0,
  tax_status TEXT DEFAULT 'default',
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_invoice_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access riti" ON public.recurring_invoice_template_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_riti_template ON public.recurring_invoice_template_items(template_id);
CREATE INDEX idx_rit_next_run ON public.recurring_invoice_templates(next_run_date) WHERE is_active = true;

-- Link generated invoices to template
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES public.recurring_invoice_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_recurring_template ON public.invoices(recurring_template_id);
