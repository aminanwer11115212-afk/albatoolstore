ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foreign_price numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid;

NOTIFY pgrst, 'reload schema';