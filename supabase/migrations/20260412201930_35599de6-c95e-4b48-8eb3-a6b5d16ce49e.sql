
-- Add missing columns to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS discount_rate numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS foreign_price numeric DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

-- Create product_companies table (brands)
CREATE TABLE IF NOT EXISTS public.product_companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read product_companies" ON public.product_companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert product_companies" ON public.product_companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update product_companies" ON public.product_companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete product_companies" ON public.product_companies FOR DELETE TO authenticated USING (true);
