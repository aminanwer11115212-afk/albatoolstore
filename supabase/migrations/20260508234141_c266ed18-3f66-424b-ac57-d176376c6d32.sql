
DROP POLICY IF EXISTS "Auth can read activity_log" ON public.activity_log;
CREATE POLICY activity_log_select_admin ON public.activity_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
