
-- 1) Replace every permissive anon+authenticated "all_*" policy with an authenticated-only equivalent
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'anon' = ANY(roles)
      AND policyname LIKE 'all\_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      r.policyname, r.tablename
    );
  END LOOP;
END $$;

-- 2) Revoke anon table privileges across the public schema (defense in depth)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', r.tablename);
  END LOOP;
END $$;

-- 3) Protect user_roles from privilege escalation: only admins can write
CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY user_roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY user_roles_admin_select_all ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Lock down SECURITY DEFINER / utility functions from API exposure.
-- These are used by triggers or invoked server-side only.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_items_silent(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_invoices() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_supplier_balance(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_balance(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_invoice(uuid, date, jsonb, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_exchange_rate_columns() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
