DROP POLICY IF EXISTS quotes_insert ON public.quotes;
CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'sales'::app_role) AND ((created_by_uid = auth.uid()) OR (created_by_uid IS NULL)))
    OR (is_side = true AND ((created_by_uid = auth.uid()) OR (created_by_uid IS NULL)))
  );

DROP POLICY IF EXISTS quotes_select ON public.quotes;
CREATE POLICY quotes_select ON public.quotes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR created_by_uid = auth.uid()
    OR created_by_uid IS NULL
    OR (is_side = true AND has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS quotes_update ON public.quotes;
CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'sales'::app_role) AND created_by_uid = auth.uid())
    OR (is_side = true AND created_by_uid = auth.uid())
  );