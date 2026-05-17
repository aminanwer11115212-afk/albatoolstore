ALTER TABLE public.invoices_packaging_items
  ADD COLUMN IF NOT EXISTS packs_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pieces_per_pack INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.quotes_packaging_items
  ADD COLUMN IF NOT EXISTS packs_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pieces_per_pack INTEGER NOT NULL DEFAULT 1;

UPDATE public.invoices_packaging_items
  SET pieces_per_pack = COALESCE(quantity, 1)
  WHERE packs_count = 1 AND pieces_per_pack = 1 AND COALESCE(quantity, 1) <> 1;

UPDATE public.quotes_packaging_items
  SET pieces_per_pack = COALESCE(quantity, 1)
  WHERE packs_count = 1 AND pieces_per_pack = 1 AND COALESCE(quantity, 1) <> 1;