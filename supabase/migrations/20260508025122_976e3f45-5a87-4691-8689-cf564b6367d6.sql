
-- Items table for invoice transports (mirrors invoices_packaging_items)
CREATE TABLE IF NOT EXISTS public.invoices_transports_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_transport_id uuid NOT NULL REFERENCES public.invoice_transports(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,
  quantity integer NOT NULL DEFAULT 1,
  packs_count integer NOT NULL DEFAULT 1,
  pieces_per_pack integer NOT NULL DEFAULT 1,
  price numeric(15,2) DEFAULT 0,
  total numeric(15,2) DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iti_header ON public.invoices_transports_items(invoice_transport_id);
CREATE INDEX IF NOT EXISTS idx_iti_product ON public.invoices_transports_items(product_id);

ALTER TABLE public.invoices_transports_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iti_select" ON public.invoices_transports_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "iti_insert" ON public.invoices_transports_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "iti_update" ON public.invoices_transports_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "iti_delete" ON public.invoices_transports_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
