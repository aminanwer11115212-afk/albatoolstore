CREATE TABLE IF NOT EXISTS public.product_brand_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (product_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_pbl_product ON public.product_brand_links (product_id);
CREATE INDEX IF NOT EXISTS idx_pbl_brand ON public.product_brand_links (brand_id);

ALTER TABLE public.product_brand_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pbl_select" ON public.product_brand_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "pbl_insert" ON public.product_brand_links FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "pbl_update" ON public.product_brand_links FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "pbl_delete" ON public.product_brand_links FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Backfill من company_id الحالي
INSERT INTO public.product_brand_links (product_id, brand_id)
SELECT id, company_id FROM public.products
WHERE company_id IS NOT NULL
ON CONFLICT (product_id, brand_id) DO NOTHING;