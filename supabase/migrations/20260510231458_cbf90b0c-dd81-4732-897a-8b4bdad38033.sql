
-- 1. Employees: restrict SELECT to admin or own record (no longer exposing salaries to all staff)
DROP POLICY IF EXISTS "Authenticated can select employees" ON public.employees;
CREATE POLICY "employees_select_admin_or_self"
  ON public.employees FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

-- 2. Customers: tighten UPDATE to admin only (was allowing any authenticated)
DROP POLICY IF EXISTS "customers_update_auth" ON public.customers;
CREATE POLICY "customers_update_admin"
  ON public.customers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. data_anomalies: restrict SELECT to admin only
DROP POLICY IF EXISTS "auth can read data_anomalies" ON public.data_anomalies;
CREATE POLICY "data_anomalies_select_admin"
  ON public.data_anomalies FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. transactions: restrict SELECT to admin only (financial data)
DROP POLICY IF EXISTS "Anyone can read transactions" ON public.transactions;
CREATE POLICY "transactions_select_admin"
  ON public.transactions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. invoices: remove created_by_uid IS NULL bypass
DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (created_by_uid = auth.uid())
  );

-- 6. quotes: remove created_by_uid IS NULL bypass
DROP POLICY IF EXISTS "quotes_select" ON public.quotes;
CREATE POLICY "quotes_select"
  ON public.quotes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (created_by_uid = auth.uid())
    OR ((is_side = true) AND has_role(auth.uid(), 'admin'::app_role))
  );

-- 7. Storage: remove the public DELETE policy on company-assets bucket
DROP POLICY IF EXISTS "Auth delete access" ON storage.objects;
