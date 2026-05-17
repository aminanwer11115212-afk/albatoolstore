DROP POLICY IF EXISTS "Anyone can read customers" ON public.customers;
CREATE POLICY customers_select_admin ON public.customers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can read company_settings" ON public.company_settings;
CREATE POLICY company_settings_select_admin ON public.company_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));