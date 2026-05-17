-- 1) M2M table linking products to multiple categories
CREATE TABLE IF NOT EXISTS public.product_category_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, category_id)
);

ALTER TABLE public.product_category_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access pcl"
  ON public.product_category_links
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pcl_product ON public.product_category_links(product_id);
CREATE INDEX IF NOT EXISTS idx_pcl_category ON public.product_category_links(category_id);

-- 2) Add category_id to line-item tables (per-row category)
ALTER TABLE public.invoice_items       ADD COLUMN IF NOT EXISTS category_id uuid NULL;
ALTER TABLE public.quote_items         ADD COLUMN IF NOT EXISTS category_id uuid NULL;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS category_id uuid NULL;

-- 3) Backfill links from existing products.category_id (preserve current data)
INSERT INTO public.product_category_links (product_id, category_id)
SELECT p.id, p.category_id
FROM public.products p
WHERE p.category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;