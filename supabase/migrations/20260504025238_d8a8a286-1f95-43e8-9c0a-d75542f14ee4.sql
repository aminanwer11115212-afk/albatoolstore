-- Tighten RLS on customer_preferred_transporter and customer_destinations
-- Read: admin + sales only. Write: admin only.

DROP POLICY IF EXISTS "cpt_select" ON public.customer_preferred_transporter;
DROP POLICY IF EXISTS "cpt_insert" ON public.customer_preferred_transporter;
DROP POLICY IF EXISTS "cpt_update" ON public.customer_preferred_transporter;
DROP POLICY IF EXISTS "cpt_delete" ON public.customer_preferred_transporter;

CREATE POLICY "cpt_select_admin_sales" ON public.customer_preferred_transporter
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role));

CREATE POLICY "cpt_insert_admin" ON public.customer_preferred_transporter
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cpt_update_admin" ON public.customer_preferred_transporter
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cpt_delete_admin" ON public.customer_preferred_transporter
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "cd_select" ON public.customer_destinations;
DROP POLICY IF EXISTS "cd_insert" ON public.customer_destinations;
DROP POLICY IF EXISTS "cd_update" ON public.customer_destinations;
DROP POLICY IF EXISTS "cd_delete" ON public.customer_destinations;

CREATE POLICY "cd_select_admin_sales" ON public.customer_destinations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role));

CREATE POLICY "cd_insert_admin" ON public.customer_destinations
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cd_update_admin" ON public.customer_destinations
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "cd_delete_admin" ON public.customer_destinations
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));