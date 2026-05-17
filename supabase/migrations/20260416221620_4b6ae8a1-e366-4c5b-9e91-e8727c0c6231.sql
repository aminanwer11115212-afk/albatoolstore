
-- ============ Batch B: Invoice Enhancements ============

-- 1) Add columns to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tid INTEGER,
  ADD COLUMN IF NOT EXISTS tax_status TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS user_note TEXT,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS is_proforma BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_note_number TEXT,
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'SDG',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base NUMERIC(15,6) DEFAULT 1;

-- 2) Add columns to invoice_items
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS foreign_price NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS format_discount TEXT DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS tax_status TEXT DEFAULT 'default';

-- 3) Add columns to quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS tid INTEGER,
  ADD COLUMN IF NOT EXISTS tax_status TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS user_note TEXT,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'SDG',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base NUMERIC(15,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS converted_to_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- 4) Add columns to quote_items
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS foreign_price NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS format_discount TEXT DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS tax_status TEXT DEFAULT 'default';

-- 5) Sequences for tid
CREATE SEQUENCE IF NOT EXISTS public.invoices_tid_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.quotes_tid_seq START 1;

-- Initialize sequences from existing rows
SELECT setval('public.invoices_tid_seq', GREATEST((SELECT COALESCE(MAX(tid), 0) FROM public.invoices), 1));
SELECT setval('public.quotes_tid_seq', GREATEST((SELECT COALESCE(MAX(tid), 0) FROM public.quotes), 1));

-- 6) Triggers to auto-fill tid
CREATE OR REPLACE FUNCTION public.set_invoice_tid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tid IS NULL THEN
    NEW.tid := nextval('public.invoices_tid_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_quote_tid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tid IS NULL THEN
    NEW.tid := nextval('public.quotes_tid_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_invoices_tid ON public.invoices;
CREATE TRIGGER trg_invoices_tid BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_tid();

DROP TRIGGER IF EXISTS trg_quotes_tid ON public.quotes;
CREATE TRIGGER trg_quotes_tid BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_quote_tid();

-- Backfill existing rows missing tid
UPDATE public.invoices SET tid = nextval('public.invoices_tid_seq') WHERE tid IS NULL;
UPDATE public.quotes SET tid = nextval('public.quotes_tid_seq') WHERE tid IS NULL;

-- 7) Invoice revisions table (audit log per invoice)
CREATE TABLE IF NOT EXISTS public.invoice_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  action TEXT NOT NULL DEFAULT 'update',
  changed_by TEXT,
  changes JSONB,
  snapshot JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_revisions_invoice ON public.invoice_revisions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_revisions_created ON public.invoice_revisions(created_at DESC);

ALTER TABLE public.invoice_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access invoice_revisions"
ON public.invoice_revisions FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Indexes for new lookup columns
CREATE INDEX IF NOT EXISTS idx_invoices_tid ON public.invoices(tid);
CREATE INDEX IF NOT EXISTS idx_invoices_parent ON public.invoices(parent_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_proforma ON public.invoices(is_proforma);
CREATE INDEX IF NOT EXISTS idx_quotes_tid ON public.quotes(tid);
CREATE INDEX IF NOT EXISTS idx_quotes_converted ON public.quotes(converted_to_invoice_id);
