
DROP POLICY IF EXISTS "Anyone can read suppliers" ON public.suppliers;
CREATE POLICY suppliers_select_admin ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
