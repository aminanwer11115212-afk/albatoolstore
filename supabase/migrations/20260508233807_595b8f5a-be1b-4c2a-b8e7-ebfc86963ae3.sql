
-- accounts: tighten INSERT/UPDATE to admin
DROP POLICY IF EXISTS accounts_insert_auth ON public.accounts;
DROP POLICY IF EXISTS accounts_update_auth ON public.accounts;
CREATE POLICY accounts_insert_admin ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY accounts_update_admin ON public.accounts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- transactions: UPDATE admin-only (INSERT remains for staff to record payments)
DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update_admin ON public.transactions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- documents: all writes admin-only
DROP POLICY IF EXISTS documents_insert ON public.documents;
DROP POLICY IF EXISTS documents_update ON public.documents;
DROP POLICY IF EXISTS documents_delete ON public.documents;
CREATE POLICY documents_insert_admin ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY documents_update_admin ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY documents_delete_admin ON public.documents
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
