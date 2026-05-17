ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stock_deduction_id uuid,
  ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_stock_deduction_id_key
  ON public.invoices(stock_deduction_id)
  WHERE stock_deduction_id IS NOT NULL;