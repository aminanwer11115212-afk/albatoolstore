ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS supplier_invoice_number text,
  ADD COLUMN IF NOT EXISTS user_note text;

NOTIFY pgrst, 'reload schema';