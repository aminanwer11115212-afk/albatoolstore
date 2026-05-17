ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_warehouse ON public.invoice_items(warehouse_id);