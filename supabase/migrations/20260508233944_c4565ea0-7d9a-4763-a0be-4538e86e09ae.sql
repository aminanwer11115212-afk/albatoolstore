
DROP POLICY IF EXISTS "Anyone can read accounts" ON public.accounts;
CREATE POLICY accounts_select_admin ON public.accounts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
