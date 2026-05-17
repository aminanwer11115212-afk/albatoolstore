ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_is_frozen ON public.products(is_frozen);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id);