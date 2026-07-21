CREATE POLICY "Admins insert bot audit" ON public.bot_audit_log
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));