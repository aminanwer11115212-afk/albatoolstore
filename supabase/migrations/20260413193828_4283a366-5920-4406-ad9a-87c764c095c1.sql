-- Remove anon full access policy from employees
DROP POLICY IF EXISTS "Anon full access employees" ON public.employees;

-- Remove old authenticated policy and recreate granular ones
DROP POLICY IF EXISTS "Auth full access employees" ON public.employees;

CREATE POLICY "Authenticated can select employees"
  ON public.employees FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert employees"
  ON public.employees FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update employees"
  ON public.employees FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated can delete employees"
  ON public.employees FOR DELETE
  TO authenticated USING (true);