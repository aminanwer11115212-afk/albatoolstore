
-- 1. Add columns to purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS user_note text,
  ADD COLUMN IF NOT EXISTS internal_note text,
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'SDG',
  ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supplier_invoice_number text,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS updated_by text;

-- 2. Add columns to purchase_order_items
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS foreign_price numeric,
  ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS format_discount text DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS unit text;

-- 3. Create purchase_attachments table (mirror of quote_attachments)
CREATE TABLE IF NOT EXISTS public.purchase_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'details',
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 days'),
  deleted_at timestamp with time zone,
  deleted_reason text
);

ALTER TABLE public.purchase_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access purchase_attachments"
  ON public.purchase_attachments FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_purchase_attachments_order
  ON public.purchase_attachments (purchase_order_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_purchase_attachments_expires
  ON public.purchase_attachments (expires_at) WHERE deleted_at IS NULL;

-- 4. Create storage bucket for purchase attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-attachments', 'purchase-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth read purchase-attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'purchase-attachments');

CREATE POLICY "Auth upload purchase-attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'purchase-attachments');

CREATE POLICY "Auth update purchase-attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'purchase-attachments');

CREATE POLICY "Auth delete purchase-attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'purchase-attachments');

-- 5. Extend the daily cron job to also soft-delete expired purchase attachments.
-- We unschedule the old job (if exists) and create a unified one.
DO $$
BEGIN
  PERFORM cron.unschedule('soft-delete-expired-quote-attachments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('soft-delete-expired-attachments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'soft-delete-expired-attachments',
  '0 2 * * *',
  $$
    UPDATE public.quote_attachments
       SET deleted_at = now(), deleted_reason = 'auto_expired'
     WHERE expires_at < now() AND deleted_at IS NULL;
    UPDATE public.purchase_attachments
       SET deleted_at = now(), deleted_reason = 'auto_expired'
     WHERE expires_at < now() AND deleted_at IS NULL;
  $$
);
