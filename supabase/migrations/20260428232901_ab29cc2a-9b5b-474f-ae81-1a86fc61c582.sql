-- 1) Roles enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','sales','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) has_role security definer (avoids recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- helper to get current user's primary role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'sales' THEN 2 ELSE 3 END
  LIMIT 1
$$;

-- helper to fetch current user's permissions
CREATE OR REPLACE FUNCTION public.current_user_permissions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(permissions, '{}'::jsonb) FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'sales' THEN 2 ELSE 3 END
  LIMIT 1
$$;

-- 4) RLS for user_roles
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) employees: add login fields
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS login_enabled boolean NOT NULL DEFAULT false;

-- 6) created_by_uid columns on key tables
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_by_uid uuid;
ALTER TABLE public.quotes   ADD COLUMN IF NOT EXISTS created_by_uid uuid;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_by_uid uuid;

CREATE INDEX IF NOT EXISTS idx_invoices_created_by_uid ON public.invoices(created_by_uid);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by_uid ON public.quotes(created_by_uid);
CREATE INDEX IF NOT EXISTS idx_customers_created_by_uid ON public.customers(created_by_uid);

-- 7) Tighten RLS: replace permissive policies with role-aware ones
-- INVOICES
DROP POLICY IF EXISTS "Anyone can read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can delete invoices" ON public.invoices;

CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR created_by_uid = auth.uid()
    OR created_by_uid IS NULL
  );
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'sales') AND (created_by_uid = auth.uid() OR created_by_uid IS NULL))
  );
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'sales') AND created_by_uid = auth.uid())
  );
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- QUOTES
DROP POLICY IF EXISTS "Anyone can read quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anyone can insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anyone can update quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anyone can delete quotes" ON public.quotes;

CREATE POLICY "quotes_select" ON public.quotes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR created_by_uid = auth.uid()
    OR created_by_uid IS NULL
  );
CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'sales') AND (created_by_uid = auth.uid() OR created_by_uid IS NULL))
  );
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'sales') AND created_by_uid = auth.uid())
  );
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- CUSTOMERS: keep readable for everyone authenticated (so staff can pick customer); restrict delete to admin
DROP POLICY IF EXISTS "Anyone can delete customers" ON public.customers;
CREATE POLICY "customers_delete_admin" ON public.customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 8) Bootstrap: any existing authenticated user without a role becomes admin (first user is the owner).
-- This makes the migration safe: current users keep full access.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT DO NOTHING;